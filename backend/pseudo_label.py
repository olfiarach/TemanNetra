"""Turn folder-labelled photos (<src>/<denomination>/*.jpg) into YOLO boxes for training.

Box comes from the current model's top detection; class comes from the folder name
(never from the model). Images with no detection are skipped and listed for hand labelling.
Split is by source photo, so the lantai/meja/supermarket composites of one note never
straddle train/val.

Usage: python backend/pseudo_label.py <src_dir> [weights=models/best.pt] [data=backend/data]
"""
import re
import sys
import zlib
from pathlib import Path
import yaml
from PIL import Image
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))
from main import IMGSZ  # noqa: E402

MIN_CONF = 0.25  # box quality only; class is taken from the folder


def source_id(name: str) -> str:
    """'IMG..-removebg-preview.pngmeja.jpg' and 'IMG...jpg' -> 'IMG...'."""
    return re.sub(r"(-removebg-preview)?(\.png)?(lantai|meja|supermarket)?\.(jpe?g|png)$", "", name, flags=re.I)


def main(src: Path, weights: Path, data: Path):
    names = yaml.safe_load((data / "dataset.yaml").read_text())["names"]
    cls_of = {str(v): int(k) for k, v in names.items()}
    model = YOLO(str(weights))
    written, missed, disagree = 0, [], 0
    for folder in sorted(p for p in src.iterdir() if p.is_dir()):
        cls = cls_of[folder.name]  # KeyError = unknown denomination folder: fail loudly
        for img in sorted(folder.iterdir()):
            if img.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            im = Image.open(img).convert("RGB")
            r = model(im, imgsz=IMGSZ, conf=MIN_CONF, verbose=False)[0]
            top = max(r.boxes, key=lambda b: float(b.conf), default=None)
            if top is None:
                missed.append(str(img))
                continue
            disagree += model.names[int(top.cls)] != folder.name
            split = "val" if zlib.crc32(source_id(img.name).encode()) % 10 == 0 else "train"
            stem = f"ds_{folder.name}_{re.sub(r'[^A-Za-z0-9]+', '_', img.stem)}"
            im.save(data / "images" / split / f"{stem}.jpg", quality=95)
            x, y, w, h = top.xywhn[0].tolist()
            (data / "labels" / split / f"{stem}.txt").write_text(f"{cls} {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n")
            written += 1
    (data / "pseudo_missed.txt").write_text("\n".join(missed))
    print(f"written={written} missed={len(missed)} (see {data / 'pseudo_missed.txt'}) "
          f"model-vs-folder disagreements={disagree}")


if __name__ == "__main__":
    assert source_id("IMG1-removebg-preview.pngmeja.jpg") == source_id("IMG1.jpg") == "IMG1"
    a = sys.argv[1:]
    main(Path(a[0]), Path(a[1]) if len(a) > 1 else BASE_DIR / "models" / "best.pt",
         Path(a[2]) if len(a) > 2 else BASE_DIR / "backend" / "data")
