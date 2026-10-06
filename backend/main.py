import json
from pathlib import Path

from PIL import Image

from backend.utils import (
    build_class_map,
    deduplicate_boxes,
    is_valid_banknote_color,
    is_valid_banknote_geometry,
)

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "models" / "best.pt"

# Model readiness: MODEL and CLASS_MAP are set only when best.pt loads AND its class
# names map exactly onto the seven denominations. Otherwise MODEL_ERROR says why.
MODEL = None
CLASS_MAP = {}
CLASS_THRESH = {}  # cls_id -> min confidence, from models/thresholds.json (evaluate.py)
MODEL_ERROR = "Model has not been loaded"
DEVICE = "cpu"
IMGSZ = 416  # ponytail: matches the frontend frame size; retrain/benchmark before changing


def load_model(path: Path = MODEL_PATH) -> None:
    global MODEL, CLASS_MAP, CLASS_THRESH, MODEL_ERROR, DEVICE
    MODEL, CLASS_MAP, CLASS_THRESH = None, {}, {}
    if not path.exists():
        MODEL_ERROR = f"{path.name} not found; the generic YOLO fallback is not a banknote detector"
        return
    try:
        import torch
        from ultralytics import YOLO

        DEVICE = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        model = YOLO(str(path))
        CLASS_MAP = build_class_map(model.names)
        thr_path = path.with_name("thresholds.json")
        thr = json.loads(thr_path.read_text()) if thr_path.exists() else {}
        CLASS_THRESH = {i: float(thr.get(str(n), 0.45)) for i, n in model.names.items()}
        model(Image.new("RGB", (IMGSZ, IMGSZ)), device=DEVICE, imgsz=IMGSZ, verbose=False)  # warm-up
        MODEL = model
        MODEL_ERROR = ""
        print(f"Loaded banknote model {path.name} ({path.stat().st_size / 1e6:.1f} MB)", flush=True)
    except Exception as e:
        MODEL_ERROR = f"{path.name} unusable: {e}"
        print(f"Model unavailable: {MODEL_ERROR}", flush=True)


def predict(image: Image.Image) -> dict:
    """Detect banknotes in a PIL image; the reference the browser detector is checked against."""
    image = image.convert("RGB")
    img_w, img_h = image.size

    # Perform object detection.
    # ponytail: conf/iou are unmeasured defaults; tune on a held-out set (see README).
    results = MODEL(image, device=DEVICE, imgsz=IMGSZ, conf=0.45, iou=0.45, agnostic_nms=False, verbose=False)[0]

    candidate_boxes = []
    for box in results.boxes:
        note_name = CLASS_MAP.get(int(box.cls[0]))
        if not note_name:
            continue

        confidence = float(box.conf[0])
        if confidence < CLASS_THRESH.get(int(box.cls[0]), 0.45):
            continue
        xyxy = [float(c) for c in box.xyxy[0].tolist()]

        # Geometric and size validation
        if not is_valid_banknote_geometry(xyxy, img_w, img_h):
            continue

        # Color validation (reject monochrome backgrounds)
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

    # Spatial deduplication
    final_boxes = deduplicate_boxes(candidate_boxes)
    detected_notes = [b["label"] for b in final_boxes]

    return {
        "detections": detected_notes,
        "boxes": final_boxes,
        "image_size": {"width": img_w, "height": img_h},
    }
