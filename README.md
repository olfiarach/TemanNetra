# TemanNetra

TemanNetra is a prototype camera-based Indonesian Rupiah banknote reader for blind and low-vision users. It detects banknote denominations with YOLO, announces the result in Indonesian, provides audio and haptic feedback, and keeps a temporary in-browser wallet tally.

> **Prototype status:** recognition accuracy, speech latency and phone support are **not measured or verified**. No held-out evaluation set exists in this repository. `models/best.pt` is Git-ignored and its provenance is undocumented. The training dataset is not included. Do not rely on this app as assistive technology until the evaluation in `IMPROVEMENT_STRATEGY.md` is done.

## Features

- Rear/front camera switching.
- Frame capture about every 750 ms while scanning. A denomination is announced only after 3 consecutive matching single-note frames (thresholds are unmeasured defaults).
- One note at a time: frames with several notes or conflicting denominations are treated as uncertain ("Nominal belum pasti, coba lagi") and never announced or counted.
- Detection of these denominations:
  - Rp1.000
  - Rp2.000
  - Rp5.000
  - Rp10.000
  - Rp20.000
  - Rp50.000
  - Rp100.000
- Short Indonesian announcements ("Seratus ribu rupiah.") via the browser's `SpeechSynthesis`. New speech interrupts older speech. Playback failures are reported in the UI. Requires an Indonesian-capable voice on the device (unverified).
- Distinct states: camera permission denied, camera unavailable, insecure context, server unreachable, model unavailable, audio unavailable. Scanning is disabled when the camera, server or model is not ready.
- Last confirmed result stays visible; **Uji Suara** (test audio) and **Ulangi** (repeat) buttons.
- Optional vibration; bounding-box overlay.
- Temporary wallet tally (secondary; counts confirmed notes only).

## Architecture

```text
Camera
  │
  ▼
React/Vite frontend :5173
  │  relative /health and /predict (Vite proxy in dev)
  ▼
FastAPI backend :8000
  │
  ├─ YOLO inference
  ├─ label, geometry, color, and duplicate filtering
  ├─ Indonesian response text
  │
  ▼
Frontend confirmation, SpeechSynthesis, haptics, overlay, wallet tally
```

### Frontend

`frontend/src/App.jsx` owns the scan loop and detection state. `ScannerView` captures camera frames. The confirmation logic is in `frontend/src/utils/scanLogic.js`; speech in `utils/soundEffects.js`. The frontend accepts only the seven canonical labels and sends one frame at a time.

The wallet is held only in React state. Reloading the page or closing the browser clears it.

### Backend

`backend/main.py` exposes:

- `GET /health` — `{"status": "ready" | "model_unavailable", "model_ready": bool, "reason": str}`.
- `POST /predict` — multipart `file` (max 5 MB, max 25 megapixels). Returns detections and boxes. `503` when the model is unavailable, `400` for invalid images, `413` for oversized input.

There is no CORS middleware; the UI is expected to be same-origin.

`backend/utils.py` contains label aliases, `build_class_map`, geometry/color validation, duplicate suppression, and the text formatter.

## Model requirement

At startup the backend loads **only** `models/best.pt`. The generic `yolov8n.pt` is not used for detection. The backend accepts the model only if its class **names** map exactly onto the seven denominations through `BANKNOTE_ALIAS_MAP` (for example `1000`, `10000`, `100000`, `2000`, `20000`, `5000`, `50000`, or `1k`..`100k`). Class order is never guessed. If the file is missing or incompatible, `/health` reports `model_unavailable` and the app disables scanning.

`models/best.pt` is ignored by Git. There is no download URL, no training recipe that produces it from scratch, and no dataset in this repository. The checked-in `yolov8n.pt` is only the generic COCO base.

## Requirements

- Python 3.9+ recommended.
- Node.js and npm.
- A browser with camera permission, served from `localhost` or HTTPS.
- A trained `models/best.pt` (see above).
- Backend dependencies from `backend/requirements.txt`.

## Local development

### 1. Install frontend dependencies

```bash
cd frontend
npm ci
```

### 2. Install backend dependencies

Use a virtual environment rather than installing into the system Python:

```bash
cd backend
python3 -m venv venv
. venv/bin/activate
pip install -r requirements.txt
cd ..
```

PyTorch and Ultralytics may require a platform-specific installation choice. Follow their installation guidance if the generic requirements installation does not select a usable build.

### 3. Restore the model

Place the trained model at `models/best.pt`. Without a compatible model the app starts but reports `model unavailable` and cannot scan.

### 4. Start the backend

From the repository root:

```bash
./run_backend.sh
```

The script uses `backend/venv/bin/python` when available, otherwise `venv/bin/python`, then falls back to `python3`. It starts the API at `http://127.0.0.1:8000`.

To check it:

```bash
curl http://127.0.0.1:8000/health
```

### 5. Start the frontend

In another terminal:

```bash
cd frontend
npm run dev
```

Open the printed Vite URL, normally `http://localhost:5173`.

The frontend calls relative `/health` and `/predict`. In development, Vite forwards them to `http://127.0.0.1:8000` (`frontend/vite.config.js`). The same applies to `npm run preview`.

### Deployment topology and phones

- **Verified:** same computer, `http://localhost:5173`. The page loads, the camera is acquired and `/health` and `/predict` work through the proxy. Speech from a real banknote through the camera was not tested.
- **Not verified:** phone use. The dev server now listens on localhost only. Browsers require a secure context for the camera, so a plain `http://<LAN-IP>:5173` URL is not expected to work. A phone needs an HTTPS origin that serves the built frontend and forwards `/health` and `/predict` to the local FastAPI process (for example through a reverse proxy). That setup is not provided or tested here.
- Do not expose the API publicly: it has no authentication or rate limiting.

## API

### `GET /health`

```json
{"status": "ready", "model_ready": true, "reason": ""}
```

### `POST /predict`

Send a multipart form upload with the field name `file`:

```bash
curl -X POST \
  -F "file=@models/test_detected_100k.jpg" \
  http://127.0.0.1:8000/predict
```

Response shape:

```json
{
  "text": "Terdeteksi satu lembar Seratus Ribu Rupiah.",
  "detections": ["Seratus Ribu"],
  "boxes": [
    {
      "label": "Seratus Ribu",
      "confidence": 0.91,
      "box_2d": [10, 20, 500, 400],
      "box_normalized": [0.02, 0.04, 0.87, 0.92]
    }
  ],
  "image_size": {"width": 577, "height": 433}
}
```

## Training

Current `models/best.pt` is **YOLOv8x** (137 MB, trained at 416). Measured on an M-series Mac at 416: ~107 ms CPU / ~45 ms MPS per frame; `yolov8n` is ~13 ms / ~6 ms. Its stored val metrics (recall 1.0) come from an unknown, likely frame-leaky split and are not trusted.

Retrain a nano/small model (untested here, dataset required):

```bash
# 1. Set path: in backend/data/dataset.yaml; split by physical note + capture session.
venv/bin/python backend/train.py backend/data/dataset.yaml models/yolov8n.pt 150   # or yolov8s.pt
# 2. Gate on independent phone captures incl. no-note/hard-negative scenes:
venv/bin/python backend/evaluate.py runs/banknote/weights/best.pt /path/to/heldout
# 3. Only if FALSE SPOKEN = 0 and recall is acceptable:
cp runs/banknote/weights/{best.pt,thresholds.json} models/
```

`main.py` reads optional `models/thresholds.json` (per-class min confidence, default 0.45). A class with threshold 1.01 never speaks.

## Verification status

Run in this checkout:

- `venv/bin/python -m unittest backend.test_main` — class mapping, readiness, upload bounds, no CORS (fake detector).
- `cd frontend && npm test` — confirmation state machine and speech serialization/failure handling (mocked `SpeechSynthesis`).
- `cd frontend && npm run build`.
- Smoke: with the local `best.pt`, `/predict` through the Vite proxy returned a plausible label for the three sample photos in `models/`. This is a smoke check, not an accuracy measurement.

Not verified (blocked on real notes, a held-out dataset or the target phone):

- Recognition accuracy, false announcements on no-note scenes, threshold choice.
- Capture-to-speech latency, Indonesian voice availability and quality, screen-reader interaction.
- Phone camera/HTTPS setup.
- Training, and container deployment (`backend/Dockerfile` is empty).

## Security and privacy notes

- Camera frames are sent to the local FastAPI server for inference and are not stored or logged. No external speech service is used.
- Uploads are capped (5 MB, 25 megapixels). The API has no authentication or rate limiting.
- Treat results as assistive suggestions, not financial verification. Test extensively across lighting, angles, occlusion, damaged notes, and cluttered backgrounds before real-world use.

## Repository layout

```text
.
├── backend/
│   ├── data/                  # Dataset YAML files; image data is not committed
│   ├── main.py                # FastAPI API and YOLO inference
│   ├── test_main.py           # Backend tests (fake detector)
│   ├── requirements.txt
│   ├── train.py               # Train nano/small detector
│   ├── evaluate.py            # Held-out safety gate + thresholds.json
│   └── utils.py               # Labels, validation, speech, and box filtering
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   └── utils/
│   ├── package.json
│   └── vite.config.js
├── models/
│   ├── yolov8n.pt             # Generic COCO base (not a banknote detector)
│   └── test_detected_*.jpg    # Sample images
├── run_backend.sh
└── README.md
```
