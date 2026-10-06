import os
import sys
from pathlib import Path
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent.parent

def run_finetune(epochs: int = 5):
    model_path = BASE_DIR / "models" / "best.pt"
    data_path = BASE_DIR / "backend" / "data" / "dataset_finetune.yaml"

    print(f"Loading base model from {model_path} ...", flush=True)
    model = YOLO(str(model_path))

    print(f"Starting focused fine-tuning for {epochs} epochs ...", flush=True)
    results = model.train(
        data=str(data_path),
        epochs=epochs,
        imgsz=640,
        batch=8,
        lr0=0.0005,
        lrf=0.01,
        freeze=10,
        project=str(BASE_DIR / "runs"),
        name="finetune_5k",
        exist_ok=True,
        verbose=True,
        workers=2,
    )

    # Copy best fine-tuned weights back
    best_finetuned = BASE_DIR / "runs" / "finetune_5k" / "weights" / "best.pt"
    if best_finetuned.exists():
        print(f"Fine-tuning complete! Updating {model_path} with new weights ...", flush=True)
        import shutil
        shutil.copy(str(best_finetuned), str(model_path))
        print("Successfully updated models/best.pt!", flush=True)
    else:
        print("Training finished without saving weights/best.pt", flush=True)

if __name__ == "__main__":
    epochs = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    run_finetune(epochs=epochs)
