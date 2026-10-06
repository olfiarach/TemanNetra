"""Run from repo root: venv/bin/python -m unittest backend.test_main -v
Uses a fake detector; says nothing about banknote recognition accuracy."""
import unittest
from pathlib import Path
from types import SimpleNamespace

from PIL import Image

from backend import main, utils

NAMES = {0: "1000", 1: "10000", 2: "100000", 3: "2000", 4: "20000", 5: "5000", 6: "50000"}


def img(color=(200, 40, 40)):
    return Image.new("RGB", (200, 100), color)


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


class PredictTests(unittest.TestCase):
    def ready(self, boxes):
        main.CLASS_MAP = utils.build_class_map(NAMES)
        main.CLASS_THRESH = {}
        main.MODEL = lambda *a, **k: [SimpleNamespace(boxes=boxes)]

    def test_missing_model_file_not_replaced_by_fallback(self):
        main.load_model(Path("/nonexistent/best.pt"))
        self.assertIsNone(main.MODEL)
        self.assertIn("not found", main.MODEL_ERROR)

    def test_detects_with_mapped_label(self):
        self.ready([FakeBox(2, 0.9, [20, 10, 180, 90], [0.1, 0.1, 0.9, 0.9])])
        r = main.predict(img())
        self.assertEqual(r["detections"], ["Seratus Ribu"])
        self.assertEqual(r["image_size"], {"width": 200, "height": 100})

    def test_no_note_and_color_filter(self):
        self.ready([])
        self.assertEqual(main.predict(img())["detections"], [])
        self.ready([FakeBox(2, 0.9, [20, 10, 180, 90], [0.1, 0.1, 0.9, 0.9])])
        self.assertEqual(main.predict(img((128, 128, 128)))["detections"], [])


class UtilsTests(unittest.TestCase):
    def test_overlap(self):
        self.assertEqual(utils.overlap([0, 0, 10, 10], [0, 0, 10, 10]), (1.0, 1.0))
        iou, cont = utils.overlap([0, 0, 10, 10], [0, 0, 5, 5])
        self.assertAlmostEqual(iou, 0.25)
        self.assertEqual(cont, 1.0)
        self.assertEqual(utils.overlap([0, 0, 1, 1], [5, 5, 6, 6]), (0.0, 0.0))

    def test_dedup_same_label_vs_different_label(self):
        a = {"label": "A", "confidence": 0.9, "box_2d": [0, 0, 10, 10]}
        same = {"label": "A", "confidence": 0.8, "box_2d": [1, 1, 10, 10]}
        other = {"label": "B", "confidence": 0.7, "box_2d": [2, 0, 12, 10]}  # IoU ~0.67 < 0.70
        self.assertEqual(utils.deduplicate_boxes([same, a, other]), [a, other])

    def test_alias_is_case_insensitive(self):
        self.assertEqual(utils.BANKNOTE_ALIAS_MAP.get("50000"), "Lima Puluh Ribu")
        self.assertIs(utils.is_valid_banknote_geometry([0, 0, 200, 100], 200, 100), False)


if __name__ == "__main__":
    unittest.main()
