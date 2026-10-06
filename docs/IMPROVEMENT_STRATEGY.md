# TemanNetra: camera-to-speech improvement strategy

## Goal

A blind or low-vision user opens the app, points a camera at **one Rupiah banknote**, and hears its denomination promptly and reliably. The app must not confidently announce an uncertain or incorrect value. Wallet tally and multiple simultaneous notes are secondary.

> **Update 2026-10-06:** the connection/deployment and speech gaps below are superseded. The app now runs the model in the browser and is hosted on GitHub Pages (see `docs/GITHUB_PAGES_DEPLOYMENT_DESIGN.md`); `models/best.pt` has a documented source (release `v1.0.0`, checksum in README). The accuracy, dataset and evaluation items still stand.

**Status:** This is a plan, not a description of implemented improvements. The checked-in repo lacks the custom `models/best.pt` and training images, so banknote accuracy and end-to-end speech have not been established. A healthy API or a successful frontend build does not prove recognition.

## What exists today

| Stage | Current implementation | Gap |
| --- | --- | --- |
| Camera | `ScannerView.jsx` requests a camera and captures JPEG frames. | Every `getUserMedia` failure shows the same permission message; permission denial, missing camera, insecure context, and audio-start failures need distinct user-facing states. |
| Connection | `App.jsx` posts frames to `http://127.0.0.1:8000/predict`; backend binds to `127.0.0.1`. | A phone cannot reach the host's loopback address; serving the UI over LAN HTTP may also prevent camera access because browsers require a secure context. |
| Recognition | `main.py` loads `best.pt` if present, otherwise generic `yolov8n.pt`; `utils.py` filters labels, geometry, color, and overlapping boxes. | `best.pt` is absent. With the generic fallback, `resolve_label_name` rejects every COCO class, so the app never detects a note yet still appears ready. `train_finetune.py` fine-tunes an existing `best.pt` and cannot bootstrap one. For a ≤7-class model with unrecognized label names, the alphabetical index map always wins (`utils.py`), so a numerically ordered model would silently announce wrong denominations. The `conf=0.45` comment cites results that have no included evaluation evidence. |
| Confirmation | `App.jsx` announces after two matching frames **or one frame with confidence ≥ 0.65**. | One incorrect high-confidence frame can be spoken as fact. Same signature can be re-announced after the 2.5-second lockout. |
| Speech | Backend produces base64 MP3 via `gTTS` for detected frames, with browser speech fallback. | The external TTS request adds latency and requires connectivity; an audio `play()` rejection resolves as success in `soundEffects.js`, so the speech fallback never runs. Device output volume is controlled by the user/OS. |
| Feedback | Chimes, vibration, visual text and boxes, wallet tally. | A user needs a clear ready/error/uncertain state and an accessible repeat control, not just visual boxes. |

## Delivery order

### 1. Establish a working, measured detector — blocker

- Obtain a trained Rupiah `models/best.pt` and a documented artifact source (initial training recipe + dataset, since `train_finetune.py` requires an existing `best.pt`); do not represent the generic fallback as banknote-ready. At startup, require the model's class **names** to map exactly onto the seven supported denominations via `BANKNOTE_ALIAS_MAP`; remove the index-based fallback maps in `utils.py` (they guess label order). If the model is missing or incompatible, fail clearly (e.g. `/health` reports `model unavailable`) rather than showing a misleading "ready" state.
- Assemble a held-out evaluation set containing each denomination and **no-note** scenes, varied lighting, distance, orientation, wear, and backgrounds. Keep evaluation images separate from training data. Include visually similar non-notes and notes partially outside the frame.
- Measure per-denomination misses, incorrect denominations, and false announcements on no-note scenes. Record capture-to-speech latency on the intended phone and host. Use these measurements to select thresholds; do not assume the existing `0.45` model confidence, `0.65` one-frame shortcut, or color threshold is safe.
- Start with **one note at a time**. Do not rely on wallet totals or multi-note counting until that simpler task is dependable.

**Exit check:** With the restored model, real held-out notes produce the correct spoken value; no-note scenes do not produce a spoken denomination. Publish measured results and limitations before describing it as reliable assistive technology.

### 2. Make capture and network setup work on the target device

- Decide the actual deployment topology first. On the same computer, loopback works. On a phone, the frontend's `127.0.0.1` targets the phone while the backend listens only on the computer's loopback interface.
- For phone use, serve the UI and `/predict` from an **HTTPS origin** reachable by the phone (for example, an HTTPS reverse proxy forwarding to the local FastAPI process). Use a relative `/predict` URL in the frontend. This avoids mixed-content requests and a manually hard-coded LAN IP. A plain `http://<LAN-IP>:5173` URL is not a dependable camera setup because `getUserMedia` requires a secure context; `localhost` is a special case only on the same device.
- CORS is currently `allow_origins=["*"]`; with a same-origin proxy it is unnecessary, so restrict or remove it. If temporarily binding the API to a LAN interface for testing, restrict access to the trusted network, cap upload bytes and decoded image dimensions, and do not expose it publicly. Update the README with the chosen setup rather than offering a phone URL that cannot reach the backend.
- Expose `camera permission needed`, `camera unavailable`, `server unreachable`, and `model unavailable` distinctly. Disable scanning when recognition cannot work.

**Exit check:** On the intended phone, camera permission succeeds, a captured frame reaches the backend, and a known note produces a response over the intended connection; repeat after a reload and after denying camera permission.

### 3. Announce only a confirmed result

- Require repeated agreement for a denomination before speaking it; remove the current single-frame high-confidence shortcut until held-out testing justifies it. Use the **same note identity** only while the note remains visible; clear confirmation after sustained absence or a changed denomination. Avoid announcing the same stationary note again merely because a timer expired.
- For inconclusive frames, provide a short prompt such as “Nominal belum pasti, coba lagi” rather than guessing a value. Keep guidance rate-limited so it does not drown out results.
- Use the existing detection box to add guidance only when evidence supports it (for example, box near a frame edge). Do not claim “too dark” or “too close” without measuring image conditions and validating the rule on real devices.
- Keep the last **confirmed** result visible and repeatable, including when scanning is paused.

**Exit check:** Hold one note still, remove and reinsert it, switch denominations, show an ambiguous image, and show no note. Each newly confirmed note is spoken once; ambiguous/no-note inputs never produce a guessed denomination.

### 4. Make speech immediate and recoverable

- First use the browser's installed `SpeechSynthesis` for short Indonesian denomination announcements, or bundle seven locally produced audio clips if device testing shows voices are missing, slow, or unclear. Do not request `gTTS` on every prediction frame for a fixed set of phrases. Choose based on observed latency and voice quality on target devices.
- Start playback only after an explicit user gesture if required by the browser. Add a **Test audio / Uji suara** action and an obvious **Repeat / Ulangi** action; report speech unavailability instead of silently succeeding. Speech cannot override a muted device or force hardware volume: tell the user to raise device/media volume.
- Serialize speech and cues. A newly confirmed denomination must interrupt obsolete prompts rather than overlap them. Make the announcement short: “Seratus ribu rupiah.” Keep haptic feedback optional and supplementary.
- Keep text accessible to screen readers (`role="status"` or an appropriately scoped live region), but avoid double announcements when both the app and screen reader speak. Test this interaction with the target assistive technology.

**Exit check:** On the intended device, test-audio, first recognition, repeat, speech failure, and rapid successive detections are understandable without stacked playback; measure time from confirmed detection to audible result.

### 5. Simplify the scanner screen

Keep the primary view focused on: camera readiness, one instruction (“Arahkan satu lembar uang ke kamera”), the last confirmed denomination, scanning start/pause, test/repeat speech, and camera switch. Place wallet tally below or outside the primary flow. Preserve labeled buttons, visible focus, readable contrast, and a nonvisual description of status; visual boxes alone do not help a blind user.

**Exit check:** A user can grant permission, scan a note, hear its value, repeat it, and recover from denied permission or a disconnected server without interpreting bounding boxes.

## Out of scope until core recognition is proven

- New model architectures, on-device inference, wallet persistence, complex multi-note tracking, and automatic counterfeit detection.
- Claims of accuracy, offline operation, or production readiness without measured evidence.

## Implementation map

- `backend/main.py`: model readiness, prediction input bounds, avoid per-frame TTS generation.
- `backend/utils.py`: retain only validated filtering rules; preserve canonical denomination names; delete `INDEX_TO_BANKNOTE` / `ALPHABETICAL_INDEX_TO_BANKNOTE` fallbacks.
- `backend/train_finetune.py`: document or add the initial training path that produces `best.pt`.
- `frontend/src/App.jsx`: connection, confirmation lifecycle, spoken-result queue, error/uncertain states.
- `frontend/src/components/ScannerView.jsx`: camera readiness and permission recovery.
- `frontend/src/utils/soundEffects.js`: playback failure and interruption behavior.
- `frontend/src/components/StatusBanner.jsx`: accessible statuses.
- `frontend/src/components/WalletSummary.jsx`: keep tally secondary; do not count uncertain detections.
- `README.md`: actual model acquisition, evaluated accuracy, and working phone/HTTPS setup when available.
