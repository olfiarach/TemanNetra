"""Build the static assets for the browser-only (GitHub Pages) deployment.

    python backend/export_web.py

Writes into frontend/public/:
  model/best.onnx  - models/best.pt exported for onnxruntime-web (imgsz 416)
  model/meta.json  - class labels and per-class thresholds by class index
  tts/<slug>.mp3   - gTTS audio for the app's fixed phrases (anything else uses the browser voice)
"""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE))
from backend.main import IMGSZ, MODEL_PATH  # noqa: E402
from backend.utils import build_class_map  # noqa: E402

OUT = BASE / "frontend" / "public"
PT_SHA256 = "a910b6976ac24ed3a7f74b6058060a3280436b2209ff885add4f0a47769311fe"  # release v1.0.0

# Keep in sync with the literal say()/preloadSpeech phrases in frontend/src (scanLogic.js, App.jsx).
# A missing phrase is not an error: the app falls back to the browser voice for it.
PHRASES = [
    *[f"{n[0]}{n[1:].lower()} rupiah." for n in
      ["Satu Ribu", "Dua Ribu", "Lima Ribu", "Sepuluh Ribu", "Dua Puluh Ribu", "Lima Puluh Ribu", "Seratus Ribu"]],
    "Ada lebih dari satu uang. Tunjukkan satu lembar saja.",
    "Terlalu jauh. Dekatkan uang ke kamera.",
    "Terlalu dekat. Jauhkan sedikit.",
    "Geser uang ke tengah kamera.",
    "Uang belum terlihat. Arahkan uang ke kamera.",
    "Nominal belum pasti, coba lagi",
    "Pemindaian dimulai. Arahkan satu lembar uang ke kamera.",
    "Pemindaian dijeda.",
    "Tes suara.",
    "Belum ada hasil.",
    "Dompet masih kosong.",
]


def slug(text: str) -> str:
    """Must match ttsSlug() in frontend/src/utils/soundEffects.js."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def main() -> None:
    from gtts import gTTS
    from ultralytics import YOLO

    digest = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    if digest != PT_SHA256:
        raise SystemExit(f"{MODEL_PATH} sha256 {digest} != {PT_SHA256}; refusing to export an unknown model")

    model = YOLO(str(MODEL_PATH))
    labels = build_class_map(model.names)  # raises unless exactly the seven denominations
    thr = json.loads((MODEL_PATH.with_name("thresholds.json")).read_text())
    onnx_path = Path(model.export(format="onnx", imgsz=IMGSZ, opset=17, simplify=True, dynamic=False))

    (OUT / "model").mkdir(parents=True, exist_ok=True)
    shutil.copy(onnx_path, OUT / "model" / "best.onnx")
    meta = {
        "imgsz": IMGSZ,
        "source_sha256": PT_SHA256,
        "labels": [labels[i] for i in sorted(labels)],
        "thresholds": [float(thr.get(str(model.names[i]), 0.45)) for i in sorted(labels)],
    }
    (OUT / "model" / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")

    (OUT / "tts").mkdir(exist_ok=True)
    for text in PHRASES:
        gTTS(text=text, lang="id").save(str(OUT / "tts" / f"{slug(text)}.mp3"))
    print(f"Wrote model ({onnx_path.stat().st_size / 1e6:.1f} MB) and {len(PHRASES)} phrases to {OUT}")


if __name__ == "__main__":
    main()
