"""Check the browser detector (frontend/src/utils/detector.js) against the Python /predict.

    python backend/web_parity.py      # needs models/best.pt and `python backend/export_web.py` output

Each sample image is resized to the scanner's frame size (<= 416 px), sent losslessly to the
FastAPI /predict with the backend's model swapped for the exported ONNX, and run through the JS
pipeline under Node. Same model on both sides, so results must agree within 0.01: this tests
the port (thresholds, NMS, geometry, colour, dedup), not PyTorch-vs-ONNX drift.
"""
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))
from backend import main  # noqa: E402

SAMPLES = sorted((BASE / "models").glob("test_detected_*.jpg"))


def main_() -> None:
    assert SAMPLES, "no sample images in models/"
    expected = {}
    from ultralytics import YOLO

    with tempfile.TemporaryDirectory() as tmp, TestClient(main.app) as client:
        main.MODEL = YOLO(str(BASE / "frontend" / "public" / "model" / "best.onnx"), task="detect")
        for path in SAMPLES:
            img = Image.open(path).convert("RGB")
            img.thumbnail((416, 416), Image.BILINEAR)  # what ScannerView.captureFrame sends
            (Path(tmp) / f"{path.stem}.rgba").write_bytes(img.convert("RGBA").tobytes())
            (Path(tmp) / f"{path.stem}.json").write_text(json.dumps({"width": img.width, "height": img.height}))
            buf = io.BytesIO()
            img.save(buf, "PNG")
            res = client.post("/predict", files={"file": ("f.png", buf.getvalue(), "image/png")})
            assert res.status_code == 200, res.text
            expected[path.stem] = res.json()["boxes"]
        out = subprocess.run(["node", "scripts/parity.mjs", tmp], cwd=BASE / "frontend",
                             capture_output=True, text=True, check=True).stdout
    actual = json.loads(out)

    failures = 0
    for name, exp in expected.items():
        got = actual[name]
        ok = [b["label"] for b in exp] == [b["label"] for b in got] and all(
            abs(e["confidence"] - g["confidence"]) <= 0.01
            and all(abs(x - y) <= 0.01 for x, y in zip(e["box_normalized"], g["box_normalized"]))
            for e, g in zip(exp, got)
        )
        failures += not ok
        print(f"{"OK  " if ok else "FAIL"} {name}: python={[(b["label"], b["confidence"], b["box_normalized"]) for b in exp]} "
              f"js={[(b["label"], b["confidence"], b["box_normalized"]) for b in got]}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main_()
