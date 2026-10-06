"""Held-out safety gate: false-spoken-denomination rate, per-class thresholds, latency.

Usage: python backend/evaluate.py <weights.pt> <heldout_dir> [max_false_rate=0.0]
heldout_dir/images/*.jpg + heldout_dir/labels/*.txt (YOLO format; missing/empty label = no-note scene).
Use phone captures from sessions NOT in training. Frame-level only; the frontend's
temporal confirmation adds more safety on top. Writes <weights_dir>/thresholds.json.
"""
import json
import statistics
import sys
import time
from pathlib import Path
from PIL import Image
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).resolve().parent))
from main import IMGSZ  # noqa: E402
from utils import build_class_map  # noqa: E402

GRID = [round(0.30 + 0.05 * i, 2) for i in range(14)]  # 0.30 .. 0.95


def collect(weights: str, root: Path):
    model = YOLO(weights)
    build_class_map(model.names)
    rows, lat = [], []
    for img in sorted((root / "images").glob("*")):
        lbl = root / "labels" / f"{img.stem}.txt"
        truth = {model.names[int(l.split()[0])] for l in lbl.read_text().splitlines() if l.strip()} if lbl.exists() else set()
        t = time.perf_counter()
        r = model(Image.open(img).convert("RGB"), imgsz=IMGSZ, conf=0.05, verbose=False)[0]
        lat.append((time.perf_counter() - t) * 1000)
        top = max(r.boxes, key=lambda b: float(b.conf), default=None)
        rows.append((truth, model.names[int(top.cls)] if top else None, float(top.conf) if top else 0.0))
    return model.names, rows, lat


def pick_thresholds(names, rows, max_false_rate):
    """Per predicted class: lowest threshold whose false announcements <= max_false_rate."""
    out = {}
    for name in names.values():
        mine = [(t, c) for t, p, c in rows if p == name]
        if not any(t == {name} for t, _, _ in rows):
            out[name] = 1.01  # no held-out evidence for this class: stay silent
            continue
        for thr in GRID + [1.01]:
            said = [t for t, c in mine if c >= thr]
            wrong = sum(1 for t in said if t != {name})  # no-note, wrong note, or multi-note
            if not said or wrong / len(said) <= max_false_rate:
                out[name] = thr
                break
    return out


def report(names, rows, lat, thr):
    said = [(t, p) for t, p, c in rows if p and c >= thr[p]]
    false = sum(1 for t, p in said if t != {p})
    empty = [r for r in rows if not r[0]]
    print(f"images={len(rows)} no-note={len(empty)} spoken={len(said)} FALSE SPOKEN={false}")
    print(f"no-note false-announcement rate={sum(1 for t, p, c in empty if p and c >= thr[p]) / max(len(empty), 1):.3f}")
    for name in names.values():
        pos = [r for r in rows if r[0] == {name}]
        hit = sum(1 for t, p, c in pos if p == name and c >= thr[name])
        print(f"  {name:>6}: thr={thr[name]:.2f} recall={hit}/{len(pos)}")
    print(f"latency ms: median={statistics.median(lat):.0f} p95={sorted(lat)[int(0.95 * (len(lat) - 1))]:.0f}")


if __name__ == "__main__":
    weights, root = sys.argv[1], Path(sys.argv[2])
    names, rows, lat = collect(weights, root)
    thr = pick_thresholds(names, rows, float(sys.argv[3]) if len(sys.argv) > 3 else 0.0)
    report(names, rows, lat, thr)
    out = Path(weights).with_name("thresholds.json")
    out.write_text(json.dumps(thr, indent=2))
    print(f"wrote {out} (1.01 = class never safe; it will stay silent)")
