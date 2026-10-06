# TemanNetra GitHub Pages Deployment Design

- **Date:** 2026-10-06
- **Status:** Implemented on `revamp/improvement`. Not yet verified on a phone.
- **Supersedes:** the Render and Hugging Face Spaces designs. Render needs a credit card and its 512 MB free instance measured too small (about 565 MiB). HF Docker Spaces are now paid.
- **Audience:** Public academic demo

## Decision

Run the model **in the visitor's browser** and host the app as static files on GitHub Pages. This needs no server, no card, no cold starts and no sleeping, and it is free with HTTPS, which phone camera access requires.

```text
Phone browser  --HTTPS-->  GitHub Pages (static: HTML/JS, model/best.onnx, tts/*.mp3)
   |
   +-- onnxruntime-web (wasm, 1 thread) runs YOLOv8n at 416x416 on each frame
   +-- JS port of the backend's post-processing
```

## Components

| Piece | Where | Notes |
|---|---|---|
| Model export | `backend/export_web.py` | Refuses to run unless `best.pt` matches the release checksum. Exports ONNX (opset 17, 416, static) and writes `meta.json` (labels, thresholds) plus the gTTS clips. |
| Detector | `frontend/src/utils/detector.js` | Ports `/predict`: letterbox, per-class NMS (conf 0.45, IoU 0.45), per-class thresholds, geometry check, saturation check (36 or more), dedup. |
| Parity check | `backend/web_parity.py` + `frontend/scripts/parity.mjs` | Runs the backend pipeline and the JS pipeline on the same ONNX and sample frames. Labels must match, and confidence and boxes must agree within 0.01. |
| Speech | `frontend/public/tts/<slug>.mp3` | Fixed phrases are pre-generated. Other phrases use the browser voice. |
| Deploy | `.github/workflows/pages.yml` | Runs on push to `main` or manually: `npm ci`, test, build, and fails if the model is missing. |

## Behaviour

- **Startup:** the header shows "Memuat model" while the model downloads and initialises.
  - If the download fails, it shows "Model gagal diunduh. Periksa koneksi lalu muat ulang halaman."
  - Any other load failure shows "model tidak tersedia".
  - Scanning is enabled only once the model is ready.
- **Privacy:** camera frames never leave the device. There is no server-side logging, persistence or analytics.
- **Abuse:** there is no API to abuse, so the rate limit is irrelevant for this deployment.
- **Known accuracy gap:** the PyTorch model letterboxes a 416×312 frame to 416×320, while the fixed-size ONNX model uses 416×416. On the samples, confidence differs by up to about 0.06. Labels matched on all three samples.

## External dependency

The onnxruntime-web wasm binaries load from jsDelivr, pinned to the installed version, because Vite's bundling of ort wasm is fragile. If that CDN is unavailable, the model cannot run. Self-host the wasm files under `public/` if that matters.

## Verification

Done:

- 12 frontend tests pass, and the production build works.
- Parity check: 3 of 3 samples OK.
- The built site serves `model/best.onnx`, `meta.json` and the speech clips from relative paths.

Still to do, on real phones over the Pages URL:

- Model load time on the first visit and on a cached visit.
- Time per frame.
- Camera permission granted and denied.
- One correct reading of a known note.
- Speech playback.
- Behaviour on iOS Safari and on Android Chrome.

Record these as device observations, not as accuracy figures.

## Non-goals

- No uptime guarantee and no offline mode (beyond the browser cache).
- No wallet persistence.
- No multi-note or counterfeit detection.
- No accuracy claims without a held-out evaluation set.

## Rollback

Re-run the Pages workflow on an earlier commit, or revert the commit. Each deployed commit carries its own `meta.json`, which includes `source_sha256`.
