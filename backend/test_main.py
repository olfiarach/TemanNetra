"""Run from repo root: venv/bin/python -m unittest backend.test_main -v
Uses a fake detector; says nothing about banknote recognition accuracy."""
import io
import unittest
from types import SimpleNamespace

from fastapi.testclient import TestClient
from PIL import Image

from backend import main, utils

NAMES = {0: "1000", 1: "10000", 2: "100000", 3: "2000", 4: "20000", 5: "5000", 6: "50000"}


def jpeg(size=(200, 100), color=(200, 40, 40)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, "JPEG")
    return buf.getvalue()


class FakeBox:
    def __init__(self, cls, conf, xyxy, xyxyn):
        self.cls, self.conf = [cls], [conf]
        self.xyxy = [SimpleNamespace(tolist=lambda: xyxy)]
        self.xyxyn = [SimpleNamespace(tolist=lambda: xyxyn)]


class ClassMapTests(unittest.TestCase):
    def test_names_map_by_name_not_index(self):
        m = utils.build_class_map(NAMES)
        self.assertEqual(m[1], "Sepuluh Ribu")
        self.assertEqual(m[2], "Seratus Ribu")

    def test_rejects_generic_coco_and_partial_and_duplicate(self):
        for bad in ({0: "person", 1: "car"}, {i: n for i, n in list(NAMES.items())[:6]},
                    {**NAMES, 6: "1000"}, {}, None):
            with self.assertRaises(ValueError):
                utils.build_class_map(bad)

    def test_no_index_fallback_maps(self):
        self.assertFalse(hasattr(utils, "INDEX_TO_BANKNOTE"))
        self.assertFalse(hasattr(utils, "ALPHABETICAL_INDEX_TO_BANKNOTE"))


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        main.MODEL, main.CLASS_MAP, main.MODEL_ERROR = None, {}, "test: no model"

    def ready(self, boxes):
        main.CLASS_MAP = utils.build_class_map(NAMES)
        main.MODEL_ERROR = ""
        main.MODEL = lambda *a, **k: [SimpleNamespace(boxes=boxes)]

    def post(self, data, name="f.jpg"):
        return self.client.post("/predict", files={"file": (name, data, "image/jpeg")})

    def test_health_and_predict_unavailable(self):
        h = self.client.get("/health").json()
        self.assertEqual((h["status"], h["model_ready"]), ("model_unavailable", False))
        self.assertEqual(self.post(jpeg()).status_code, 503)

    def test_missing_model_file_not_replaced_by_fallback(self):
        from pathlib import Path
        main.load_model(Path("/nonexistent/best.pt"))
        self.assertIsNone(main.MODEL)
        self.assertIn("not found", main.MODEL_ERROR)

    def test_detects_with_mapped_label(self):
        self.ready([FakeBox(2, 0.9, [20, 10, 180, 90], [0.1, 0.1, 0.9, 0.9])])
        self.assertEqual(self.client.get("/health").json()["status"], "ready")
        r = self.post(jpeg()).json()
        self.assertEqual(r["detections"], ["Seratus Ribu"])
        self.assertNotIn("audio_b64", r)

    def test_tts_returns_mp3_and_503_on_failure(self):
        from unittest import mock
        with mock.patch.object(main, "_tts_mp3", return_value=b"ID3x"):
            r = self.client.get("/tts", params={"text": "Seratus ribu rupiah"})
        self.assertEqual((r.status_code, r.headers["content-type"]), (200, "audio/mpeg"))
        with mock.patch.object(main, "_tts_mp3", side_effect=OSError):
            self.assertEqual(self.client.get("/tts", params={"text": "x"}).status_code, 503)

    def test_no_note_and_color_filter(self):
        self.ready([])
        self.assertEqual(self.post(jpeg()).json()["detections"], [])
        self.ready([FakeBox(2, 0.9, [20, 10, 180, 90], [0.1, 0.1, 0.9, 0.9])])
        gray = jpeg(color=(128, 128, 128))
        self.assertEqual(self.post(gray).json()["detections"], [])

    def test_bad_inputs(self):
        self.ready([])
        self.assertEqual(self.post(b"not an image").status_code, 400)
        self.assertEqual(self.post(b"").status_code, 400)
        self.assertEqual(self.post(b"x" * (main.MAX_UPLOAD_BYTES + 1)).status_code, 413)
        self.assertEqual(self.post(jpeg((6000, 5000))).status_code, 413)
        self.assertEqual(self.client.post("/predict").status_code, 422)

    def test_no_cors_headers(self):
        r = self.client.get("/health", headers={"Origin": "http://evil.example"})
        self.assertNotIn("access-control-allow-origin", r.headers)


if __name__ == "__main__":
    unittest.main()
