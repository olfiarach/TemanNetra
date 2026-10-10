# TemanNetra

TemanNetra is a prototype camera-based Indonesian Rupiah banknote reader for blind and low-vision users. It detects banknote denominations with YOLO **inside the browser**, announces the result in Indonesian, gives audio and haptic feedback, and keeps a temporary in-browser wallet tally.

**Live demo:** `https://olfiarach.github.io/TemanNetra/` (GitHub Pages, no server)

> **Prototype status:** recognition accuracy, speech latency and phone support are **not measured or verified**. No held-out evaluation set exists in this repository, and the training dataset is not included. Do not rely on this app as assistive technology, or as a way to verify money, until the evaluation in `docs/IMPROVEMENT_STRATEGY.md` is done.

## Features

- Rear/front camera switching.
- Scanning runs continuously on frames while active. A denomination is announced only after 3 consecutive matching single-note frames. These thresholds are unmeasured defaults.
- One note at a time. Frames with several notes, or with conflicting denominations, are treated as uncertain ("Nominal belum pasti, coba lagi") and are never announced or counted.
- Supported denominations: Rp1.000, Rp2.000, Rp5.000, Rp10.000, Rp20.000, Rp50.000 and Rp100.000.
- Short Indonesian announcements ("Seratus ribu rupiah."):
  - Fixed phrases play pre-generated Edge TTS clips (`id-ID-GadisNeural`, `frontend/public/tts/`), so the voice does not depend on the device.
  - Other speech, such as the wallet total, uses the browser's `SpeechSynthesis`.
  - New speech interrupts older speech, and playback failures are shown in the UI.
- Distinct states for: camera permission denied, camera unavailable, insecure context, model still loading, model download failed, model unavailable, and audio unavailable. Scanning is disabled unless both the camera and the model are ready.
- The last confirmed result stays visible. **Uji Suara** tests the audio and **Ulangi** repeats the result.
- Optional vibration and a bounding-box overlay.
- Splash screen while the model loads; the logo then moves into the header.
- Temporary wallet tally. This is secondary and counts confirmed notes only.

## Architecture

```text
GitHub Pages (static files over HTTPS)
  index.html + JS bundle
  model/best.onnx, model/meta.json     <- backend/export_web.py
  tts/*.mp3                            <- backend/export_web.py
        │
        ▼
Phone browser
  Camera ─► ScannerView (frame ≤416 px, RGBA)
        ─► utils/detector.js
             onnxruntime-web (wasm) YOLOv8n @416
             per-class NMS, per-class thresholds, geometry, colour, dedup
        ─► utils/scanLogic.js (3-frame confirmation)
        ─► speech, haptics, overlay, wallet tally
```

Camera frames never leave the device. The onnxruntime wasm binaries load from jsDelivr, pinned to the installed version.

### Frontend (`frontend/`)

- `src/App.jsx` loads the model once at startup and owns the scan loop and detection state.
- `components/ScannerView.jsx` captures frames.
- `utils/detector.js` is a port of the backend's `main.predict()` pipeline.
- `utils/scanLogic.js` holds the confirmation logic.
- `utils/soundEffects.js` handles speech.
- `components/BrandMark.jsx` is the logo (splash and header).
- `motion/` and `scripts/qa/` hold the logo motion spec and the favicon/QA scripts; `outputs/` holds their renders. None of these are part of the build.

The wallet lives only in React state, so reloading or closing the page clears it.

### Backend (`backend/`): development, training and evaluation only

The deployed page does not use the backend. It remains the **reference implementation** that the browser detector is checked against, and the home of the training and evaluation tools.

- `main.py` has `load_model()` and `predict(image)`, the YOLO inference pipeline (no server).
- `utils.py` holds the label aliases, `build_class_map`, the geometry and colour checks, and duplicate suppression.
- `export_web.py` builds the browser assets: the ONNX model, `meta.json` and the speech clips.
- `web_parity.py` checks the JS detector against `main.predict()`.
- `train.py` and `evaluate.py` train a model and run the held-out safety gate.

## Model

| | |
|---|---|
| Architecture | YOLOv8n, 416 px, 7 classes (6.2 MB `.pt`, 12 MB `.onnx`) |
| Source | `https://github.com/olfiarach/TemanNetra/releases/download/v.1.1.0/best.pt` (release `v.1.1.0`). Fine-tuned from release `v1.0.0` on extra folder-labelled photos pseudo-labelled by `backend/pseudo_label.py` |
| SHA-256 | `a910b6976ac24ed3a7f74b6058060a3280436b2209ff885add4f0a47769311fe` |
| Classes | `1000`, `2000`, `5000`, `10000`, `20000`, `50000`, `100000` |
| Thresholds | `models/thresholds.json` (per-class minimum confidence; default 0.45; 1.01 means the class never speaks) |
| Web export | `frontend/public/model/best.onnx` + `meta.json`, committed and built from the `.pt` above |
| Date | 2026-10-07 |

A model is accepted only if its class **names** map exactly onto the seven denominations through `BANKNOTE_ALIAS_MAP`. Class order is never guessed. `models/best.pt` (6.2 MB) is committed; other `models/*.pt` files are Git-ignored except the generic `yolov8n.pt` (COCO base, not a banknote detector).

Its stored validation metrics come from an unknown split that is likely leaky, so they are not trusted.

## Requirements

- Node.js 20+ and npm, for the frontend.
- Python 3.9+, only for the backend, the model export and training.
- A browser with camera permission, served from `localhost` or HTTPS.

## Local development

### Frontend only (what the deployed site runs)

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173
```

The model and speech clips are already in `frontend/public/`. No backend is needed.

### Backend (reference pipeline, export, training)

```bash
python3 -m venv venv
venv/bin/pip install -r backend/requirements.txt onnx onnxruntime onnxslim   # requirements include edge-tts

curl -fL https://github.com/olfiarach/TemanNetra/releases/download/v.1.1.0/best.pt -o models/best.pt
echo "a910b6976ac24ed3a7f74b6058060a3280436b2209ff885add4f0a47769311fe  models/best.pt" | shasum -a 256 -c -
```

PyTorch and Ultralytics may need a platform-specific install. Follow their own guidance if the generic install doesn't give you a usable build.

### Updating the model, thresholds or spoken phrases

```bash
venv/bin/python backend/export_web.py    # rewrites frontend/public/model/* and tts/*
venv/bin/python backend/web_parity.py    # must print OK for every sample
```

- `export_web.py` refuses to run unless `models/best.pt` matches the checksum in the script. Update `PT_SHA256` there, and the Model table above, when you release a new artifact.
- Speech clips are generated with `edge-tts`, which needs network access to Microsoft's TTS service.
- When you add a fixed phrase to the frontend, also add it to `PHRASES` in `export_web.py`. A phrase missing from that list still works, but falls back to the browser voice.

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` runs `npm ci`, `npm test` and `npm run build`. It fails if `dist/model/best.onnx` is missing, then publishes `frontend/dist`.

One-time setup:

1. In the repo, go to **Settings → Pages → Source** and choose **GitHub Actions**.
2. If you deploy from a branch other than `main`, go to **Settings → Environments → github-pages → Deployment branches and tags** and add that branch. The workflow triggers on `main` and `revamp/improvement`.

Then push to one of those branches, or run **Deploy to GitHub Pages** from the **Actions** tab. The site is served at `https://olfiarach.github.io/TemanNetra/`. Vite uses `base: './'`, so it works under the `/TemanNetra/` path.

Rollback: re-run the workflow on an earlier commit, or revert the commit.

Design notes: `docs/GITHUB_PAGES_DEPLOYMENT_DESIGN.md`.

## `predict()` result shape

```json
{
  "detections": ["Seratus Ribu"],
  "boxes": [
    {"label": "Seratus Ribu", "confidence": 0.91, "box_2d": [10, 20, 500, 400], "box_normalized": [0.02, 0.04, 0.87, 0.92]}
  ],
  "image_size": {"width": 577, "height": 433}
}
```

`detect()` in `frontend/src/utils/detector.js` returns the same `boxes` shape.

## Training

Retraining has not been tested here, and it needs the dataset:

```bash
# 1. Set path: in backend/data/dataset.yaml; split by physical note + capture session.
venv/bin/python backend/train.py backend/data/dataset.yaml models/yolov8n.pt 150   # or yolov8s.pt
# 2. Gate on independent phone captures incl. no-note/hard-negative scenes:
venv/bin/python backend/evaluate.py runs/banknote/weights/best.pt /path/to/heldout
# 3. Only if FALSE SPOKEN = 0 and recall is acceptable:
cp runs/banknote/weights/{best.pt,thresholds.json} models/
# 4. Publish: new GitHub release asset + checksum, then export_web.py and web_parity.py (above).
```

Keep the model small. The browser runs it on the phone's CPU through wasm with one thread.

## Verification status

Run in this checkout (2026-10-06):

- `venv/bin/python -m unittest backend.test_main`: tests for class mapping, `predict()`, box overlap and dedup, using a fake detector.
- `cd frontend && npm test`: 12 tests covering the confirmation state machine and speech serialization, using a mocked `SpeechSynthesis`.
- `cd frontend && npm run build`, and a static serve of `dist/` that returns the model, `meta.json` and the speech clips.
- `backend/web_parity.py`: the JS detector matches the backend pipeline on the same ONNX model for all 3 sample photos, with labels exact and scores and boxes within 0.01.
- Compared with the PyTorch `.pt`, the ONNX scores are up to about 0.06 lower on the samples, because the input padding differs (416×416 vs 416×320). The labels match.

Not verified, because it needs real notes, a held-out dataset or the target phones:

- Recognition accuracy, false announcements on no-note scenes, and the choice of thresholds.
- On-device model load time, time per frame, and how phones cope thermally with continuous scanning.
- The camera-to-speech flow on the deployed Pages site, on iOS Safari and Android Chrome.
- Voice quality, and how it works with a screen reader.

## Security and privacy

- On the deployed site, detection runs entirely in the browser. Camera frames are never uploaded, stored or logged.
- The site loads static files from GitHub Pages, plus the onnxruntime wasm from jsDelivr. There are no analytics and no accounts.
- There is no server: the backend is a local Python module for export, parity and training only.
- Treat results as assistive suggestions, not financial verification.

## Repository layout

```text
.
├── .github/workflows/pages.yml   # Build + deploy to GitHub Pages
├── backend/
│   ├── main.py                   # Model loading and YOLO inference (`predict`)
│   ├── utils.py                  # Labels, validation, box filtering
│   ├── export_web.py             # .pt -> ONNX + meta.json + speech clips
│   ├── web_parity.py             # JS detector vs predict() check
│   ├── train.py / evaluate.py    # Training and held-out safety gate
│   ├── test_main.py
│   └── requirements.txt
├── frontend/
│   ├── public/model/             # best.onnx, meta.json (committed)
│   ├── public/tts/               # Pre-generated Edge TTS Indonesian clips
│   ├── motion/, outputs/         # Logo motion spec and renders (not built)
│   ├── scripts/parity.mjs        # Node side of the parity check
│   ├── scripts/qa/               # Favicon generation and QA scripts
│   ├── src/                      # App.jsx, components/, utils/ (detector, scanLogic, soundEffects)
│   └── vite.config.js
├── models/
│   ├── thresholds.json           # Per-class confidence thresholds
│   ├── yolov8n.pt                # Generic COCO base (not a banknote detector)
│   └── test_detected_*.jpg       # Sample images
└── docs/
```
