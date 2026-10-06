"""Train a small, fast banknote detector. Never overwrites models/best.pt.

Usage: python backend/train.py <dataset.yaml> [base=models/yolov8n.pt] [epochs=150]
Then gate it: python backend/evaluate.py runs/banknote/weights/best.pt <heldout_dir>
"""
import sys
from pathlib import Path
import torch
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
from backend.utils import build_class_map  # noqa: E402

IMGSZ = 416  # must match main.IMGSZ


def train(data: str, base: str = str(BASE_DIR / "models" / "yolov8n.pt"), epochs: int = 150) -> Path:
    model = YOLO(base)
    model.train(
        data=data, epochs=epochs, imgsz=IMGSZ, batch=16, patience=30,
        device="mps" if torch.backends.mps.is_available() else None,
        project=str(BASE_DIR / "runs"), name="banknote", exist_ok=True,
        # Realistic augmentation only (MODEL_IMPROVEMENT.md §8)
        hsv_h=0.005,     # near-zero hue shift: denomination colour is a real cue
        hsv_s=0.4, hsv_v=0.5,  # lighting / white balance
        degrees=15, perspective=0.0005, scale=0.5, translate=0.2,
        fliplr=0.0, flipud=0.0,  # mirrored notes don't exist
        mosaic=1.0, close_mosaic=15, erasing=0.3,  # occlusion
    )
    out = BASE_DIR / "runs" / "banknote" / "weights" / "best.pt"
    build_class_map(YOLO(str(out)).names)  # fail loudly on wrong class names
    print(f"Trained {out}. Evaluate before copying to models/best.pt.")
    return out


if __name__ == "__main__":
    train(*sys.argv[1:3], **({"epochs": int(sys.argv[3])} if len(sys.argv) > 3 else {}))
