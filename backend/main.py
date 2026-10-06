import io
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

# Ensure both project root and backend directory are in sys.path
BACKEND_DIR = Path(__file__).resolve().parent
BASE_DIR = BACKEND_DIR.parent
for p in [str(BASE_DIR), str(BACKEND_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.utils import (
        build_class_map,
        format_detected_speech,
        is_valid_banknote_geometry,
        is_valid_banknote_color,
        deduplicate_boxes,
    )
except ImportError:
    from utils import (
        build_class_map,
        format_detected_speech,
        is_valid_banknote_geometry,
        is_valid_banknote_color,
        deduplicate_boxes,
    )

MODEL_PATH = BASE_DIR / "models" / "best.pt"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000  # ~25 MP; covers full-resolution phone photos

# Model readiness: MODEL and CLASS_MAP are set only when best.pt loads AND its class
# names map exactly onto the seven denominations. Otherwise MODEL_ERROR says why.
MODEL = None
CLASS_MAP = {}
MODEL_ERROR = "Model has not been loaded"


def load_model(path: Path = MODEL_PATH) -> None:
    global MODEL, CLASS_MAP, MODEL_ERROR
    MODEL, CLASS_MAP = None, {}
    if not path.exists():
        MODEL_ERROR = f"{path.name} not found; the generic YOLO fallback is not a banknote detector"
        return
    try:
        from ultralytics import YOLO

        model = YOLO(str(path))
        CLASS_MAP = build_class_map(model.names)
        MODEL = model
        MODEL_ERROR = ""
        print(f"Loaded banknote model {path.name} ({path.stat().st_size / 1e6:.1f} MB)", flush=True)
    except Exception as e:
        MODEL_ERROR = f"{path.name} unusable: {e}"
        print(f"Model unavailable: {MODEL_ERROR}", flush=True)


@asynccontextmanager
async def lifespan(_app):
    load_model()
    yield


app = FastAPI(title="TemanNetra AI API", lifespan=lifespan)
# No CORS middleware: the UI reaches the API same-origin (Vite proxy / reverse proxy).


@app.get("/health")
def health():
    return {
        "status": "ready" if MODEL is not None else "model_unavailable",
        "model_ready": MODEL is not None,
        "reason": MODEL_ERROR,
    }


@app.post("/predict")
async def predict_rupiah(file: UploadFile = File(...)):
    if MODEL is None:
        raise HTTPException(503, f"model unavailable: {MODEL_ERROR}")

    # 1. Read input image with bounded size and dimensions
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "image too large")
    try:
        image = Image.open(io.BytesIO(contents))
        img_w, img_h = image.size
        if img_w * img_h > MAX_IMAGE_PIXELS:
            raise HTTPException(413, "image dimensions too large")
        image = image.convert("RGB")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "invalid image")

    # 2. Perform object detection.
    # ponytail: conf/iou are unmeasured defaults; tune on a held-out set (see README).
    results = MODEL(image, conf=0.45, iou=0.45, agnostic_nms=False, verbose=False)[0]

    candidate_boxes = []
    for box in results.boxes:
        note_name = CLASS_MAP.get(int(box.cls[0]))
        if not note_name:
            continue

        confidence = float(box.conf[0])
        xyxy = [float(c) for c in box.xyxy[0].tolist()]

        # 3. Geometric and size validation
        if not is_valid_banknote_geometry(xyxy, img_w, img_h):
            continue

        # 4. Color validation (reject monochrome backgrounds)
        crop_box = [max(0, int(xyxy[0])), max(0, int(xyxy[1])), min(img_w, int(xyxy[2])), min(img_h, int(xyxy[3]))]
        if crop_box[2] > crop_box[0] and crop_box[3] > crop_box[1]:
            if not is_valid_banknote_color(image.crop(crop_box)):
                continue

        xyxyn = [float(c) for c in box.xyxyn[0].tolist()]
        candidate_boxes.append({
            "label": note_name,
            "confidence": round(confidence, 3),
            "box_2d": [round(c, 2) for c in xyxy],
            "box_normalized": [round(c, 4) for c in xyxyn],
        })

    # 5. Spatial deduplication
    final_boxes = deduplicate_boxes(candidate_boxes, iou_threshold=0.45, containment_threshold=0.70)
    detected_notes = [b["label"] for b in final_boxes]

    return {
        "text": format_detected_speech(detected_notes),
        "detections": detected_notes,
        "boxes": final_boxes,
        "image_size": {"width": img_w, "height": img_h},
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        app_dir=str(BACKEND_DIR),
        reload_dirs=[str(BACKEND_DIR)],
    )
