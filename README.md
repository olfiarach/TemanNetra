# TemanNetra

TemanNetra is a prototype camera-based Indonesian Rupiah banknote reader for blind and low-vision users. It detects banknote denominations with YOLO, announces the result in Indonesian, provides audio and haptic feedback, and keeps a temporary in-browser wallet tally.

> **Prototype status:** the checked-in repository does not include the trained banknote model (`models/best.pt`) or the training dataset. The frontend builds, but end-to-end banknote detection is not verified from this checkout until the custom model is restored.

## Features

- Rear/front camera switching.
- Continuous frame capture approximately every 750 ms.
- Detection of these denominations:
  - Rp1.000
  - Rp2.000
  - Rp5.000
  - Rp10.000
  - Rp20.000
  - Rp50.000
  - Rp100.000
- Indonesian speech using server-side `gTTS`, with browser `SpeechSynthesis` fallback.
- Detection chimes and mobile vibration where supported.
- Bounding-box overlay for accepted detections.
- Temporary wallet total and note count.

## Architecture

```text
Camera
  │
  ▼
React/Vite frontend :5173
  │  POST /predict with JPEG frame
  ▼
FastAPI backend :8000
  │
  ├─ YOLO inference
  ├─ label, geometry, color, and duplicate filtering
  ├─ Indonesian response text
  └─ optional gTTS audio as base64
  │
  ▼
Frontend audio, haptic feedback, overlay, and wallet tally
```

### Frontend

`frontend/src/App.jsx` owns the scan loop and detection state. `ScannerView` captures camera frames. The frontend accepts only the seven canonical labels returned by the backend and sends one frame at a time to avoid overlapping requests.

The wallet is held only in React state. Reloading the page or closing the browser clears it.

### Backend

`backend/main.py` exposes:

- `GET /` — health and selected model name.
- `POST /predict` — accepts an uploaded image and returns detections, boxes, speech text, and optional audio.

`backend/utils.py` contains label aliases, geometry/color validation, duplicate suppression, speech formatting, and the in-memory audio cache.

## Model requirement

At startup the backend loads:

1. `models/best.pt`, if present.
2. Otherwise `models/yolov8n.pt`.

`models/best.pt` is the required custom banknote detector. It is ignored by Git because model weights are large. The checked-in `yolov8n.pt` is the standard generic YOLOv8 nano model, not the trained Rupiah detector; it is a fallback for development and should not be considered sufficient for the intended feature.

The training configuration expects the ignored dataset directories under `backend/data/`. The YAML files currently contain machine-specific absolute paths and must be updated before training on another machine.

## Requirements

- Python 3.9+ recommended.
- Node.js and npm.
- A browser with camera permission.
- A trained `models/best.pt` for actual banknote detection.
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

Place the trained model at:

```text
models/best.pt
```

Without it, the application may start but is not expected to detect Rupiah banknotes correctly.
There is no model download URL or training dataset in this repository. A fresh clone cannot obtain a working banknote detector without an external `best.pt` artifact or separately restored training data. Do not treat a successful backend health check as proof that detection works.

### 4. Start the backend

From the repository root:

```bash
./run_backend.sh
```

The script uses `backend/venv/bin/python` when available, otherwise `venv/bin/python`, then falls back to `python3`. It starts the API at `http://127.0.0.1:8000`.

To check it:

```bash
curl http://127.0.0.1:8000/
```

### 5. Start the frontend

In another terminal:

```bash
cd frontend
npm run dev
```

Open the printed Vite URL, normally `http://localhost:5173`.

The frontend currently uses this fixed API URL:

```text
http://127.0.0.1:8000
```

For a phone accessing Vite over a local network, edit `API_BASE_URL` in `frontend/src/App.jsx` from `http://127.0.0.1:8000` to the host computer's LAN address, for example `http://192.168.1.20:8000`. Start Vite with its existing `host: '0.0.0.0'` setting, ensure the phone and computer share the same network, and allow the backend port through the host firewall. `127.0.0.1` on the phone refers to the phone itself.

## API

### `GET /`

Example response:

```json
{
  "status": "Active",
  "message": "TemanNetra API is running",
  "model_file": "best.pt"
}
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
  "image_size": {"width": 577, "height": 433},
  "audio_b64": "..."
}
```

`audio_b64` may be `null` when gTTS is unavailable or no banknote is detected. The frontend falls back to browser speech synthesis.

## Training

`backend/train_finetune.py` fine-tunes `models/best.pt` using `backend/data/dataset_finetune.yaml` and writes the result under `runs/finetune_5k/`. It then copies the resulting `weights/best.pt` back to `models/best.pt`.

Before training:

1. Restore the ignored dataset directories.
2. Fix the absolute `path:` value in the dataset YAML for the current machine.
3. Confirm the seven class names and class ordering match the model labels.
4. Keep a validation set separate from training images.
5. Measure precision, recall, and per-denomination confusion before relying on the reader.

Example:

```bash
cd backend
python train_finetune.py 5
```

## Verification status

Verified in the repository audit:

- Python source files compile successfully with `py_compile`.
- Frontend production build succeeds with `npm run build`.
- Frontend dependencies install with `npm ci`.

Not verified from the checked-in repository:

- Backend startup, because Python backend dependencies are not installed in the audit environment.
- End-to-end banknote prediction, because `models/best.pt` is absent.
- Training, because the dataset is absent.
- Container deployment, because `backend/Dockerfile` is currently empty.

## Security and privacy notes

- Camera frames are sent to the local FastAPI server for inference.
- The image itself is not sent to `gTTS`; only the generated speech text is used for audio generation.
- The API has no authentication, rate limiting, or upload-size limit.
- CORS is currently permissive. Do not expose the backend publicly without restricting origins, methods, headers, and upload handling.
- Treat results as assistive suggestions, not financial verification. Test extensively across lighting, angles, occlusion, damaged notes, and cluttered backgrounds before real-world use.

## Repository layout

```text
.
├── backend/
│   ├── data/                  # Dataset YAML files; image data is not committed
│   ├── main.py                # FastAPI API and YOLO inference
│   ├── requirements.txt
│   ├── train_finetune.py      # Optional fine-tuning script
│   └── utils.py               # Labels, validation, speech, and box filtering
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   └── utils/
│   ├── package.json
│   └── vite.config.js
├── models/
│   ├── yolov8n.pt             # Generic fallback model
│   └── test_detected_*.jpg    # Sample images
├── run_backend.sh
└── README.md
```
