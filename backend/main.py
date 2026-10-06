import io
import sys
import base64
from pathlib import Path
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from ultralytics import YOLO

# Ensure both project root and backend directory are in sys.path
BACKEND_DIR = Path(__file__).resolve().parent
BASE_DIR = BACKEND_DIR.parent
for p in [str(BASE_DIR), str(BACKEND_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.utils import (
        resolve_label_name,
        format_detected_speech,
        generate_audio_base64,
        VALID_BANKNOTE_NAMES,
        is_valid_banknote_geometry,
        is_valid_banknote_color,
        deduplicate_boxes,
    )
except ImportError:
    from utils import (
        resolve_label_name,
        format_detected_speech,
        generate_audio_base64,
        VALID_BANKNOTE_NAMES,
        is_valid_banknote_geometry,
        is_valid_banknote_color,
        deduplicate_boxes,
    )

app = FastAPI(title="TemanNetra AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model weights
BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "models" / "best.pt"
if not MODEL_PATH.exists():
    MODEL_PATH = BASE_DIR / "models" / "yolov8n.pt"

model = YOLO(str(MODEL_PATH))
print(f"Loaded YOLO model from {MODEL_PATH} ({MODEL_PATH.stat().st_size / 1e6:.1f} MB)", flush=True)

@app.get("/")
def read_root():
    return {
        "status": "Active",
        "message": "TemanNetra API is running",
        "model_file": MODEL_PATH.name
    }

@app.post("/predict")
async def predict_rupiah(file: UploadFile = File(...)):
    # 1. Read input image
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    img_w, img_h = image.size
    
    # 2. Perform object detection with:
    # - conf=0.45: optimal threshold ensuring real banknotes (5k, 10k, 20k, 50k, 100k: conf 0.58-0.97)
    #   detect crisply while eliminating background/room noise flickers (conf < 0.40)
    # - iou=0.45: realistic overlap allowance for multiple banknotes in view
    # - agnostic_nms=False: class-aware NMS allowing multiple different banknotes held together
    results = model(
        image,
        conf=0.45,
        iou=0.45,
        agnostic_nms=False,
        verbose=False
    )[0]
    
    candidate_boxes = []
    model_names = model.names if hasattr(model, "names") else {}

    for box in results.boxes:
        cls_id = int(box.cls[0])
        note_name = resolve_label_name(cls_id, model_names)
        
        # STRICT FILTER: Ignore non-banknotes (faces, persons, COCO objects, etc.)
        if not note_name or note_name not in VALID_BANKNOTE_NAMES:
            continue

        confidence = float(box.conf[0])
        xyxy = [float(c) for c in box.xyxy[0].tolist()]

        # 3. Geometric and size validation (banknote must occupy realistic foreground space)
        if not is_valid_banknote_geometry(xyxy, img_w, img_h):
            continue

        # 4. Color validation (reject monochrome wall, ceiling plaster, and background hallucinations)
        crop_box = [max(0, int(xyxy[0])), max(0, int(xyxy[1])), min(img_w, int(xyxy[2])), min(img_h, int(xyxy[3]))]
        if crop_box[2] > crop_box[0] and crop_box[3] > crop_box[1]:
            if not is_valid_banknote_color(image.crop(crop_box)):
                continue

        if hasattr(box, "xyxyn") and box.xyxyn is not None:
            xyxyn = [float(c) for c in box.xyxyn[0].tolist()]
        else:
            xyxyn = [
                xyxy[0] / img_w if img_w > 0 else 0.0,
                xyxy[1] / img_h if img_h > 0 else 0.0,
                xyxy[2] / img_w if img_w > 0 else 0.0,
                xyxy[3] / img_h if img_h > 0 else 0.0,
            ]
            
        candidate_boxes.append({
            "label": note_name,
            "confidence": round(confidence, 3),
            "box_2d": [round(c, 2) for c in xyxy],
            "box_normalized": [round(c, 4) for c in xyxyn],
        })
        
    # 5. Spatial deduplication (NMS) allowing multiple distinct banknotes to be tracked simultaneously
    final_boxes = deduplicate_boxes(candidate_boxes, iou_threshold=0.45, containment_threshold=0.70)
    detected_notes = [b["label"] for b in final_boxes]

    if detected_notes:
        print(f"⚠️ DETECTED: {detected_notes} | Boxes: {[ (b['label'], b['confidence'], b['box_2d']) for b in final_boxes ]}", flush=True)

    # 5. Formulate natural Indonesian spoken text response
    speech_text = format_detected_speech(detected_notes)
        
    # 6. Generate audio via gTTS (base64) ONLY if notes are actually detected
    audio_b64 = generate_audio_base64(speech_text) if detected_notes else None
    
    return {
        "text": speech_text,
        "detections": detected_notes,
        "boxes": final_boxes,
        "image_size": {"width": img_w, "height": img_h},
        "audio_b64": audio_b64
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