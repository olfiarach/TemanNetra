import numpy as np
from typing import List, Dict

# Canonical Indonesian spoken names for banknotes
VALID_BANKNOTE_NAMES = {
    "Satu Ribu",
    "Dua Ribu",
    "Lima Ribu",
    "Sepuluh Ribu",
    "Dua Puluh Ribu",
    "Lima Puluh Ribu",
    "Seratus Ribu",
}

# Class names used by backend/data/dataset.yaml and the exported model (case-insensitive)
BANKNOTE_ALIAS_MAP: Dict[str, str] = {
    "1000": "Satu Ribu",
    "2000": "Dua Ribu",
    "5000": "Lima Ribu",
    "10000": "Sepuluh Ribu",
    "20000": "Dua Puluh Ribu",
    "50000": "Lima Puluh Ribu",
    "100000": "Seratus Ribu",
}

def build_class_map(model_names) -> Dict[int, str]:
    """
    Map model class ids to canonical denominations by NAME only (via BANKNOTE_ALIAS_MAP).
    Raises ValueError unless the model's classes are exactly the seven supported
    denominations; class order is never guessed.
    """
    mapping: Dict[int, str] = {}
    for cls_id, raw_name in dict(model_names or {}).items():
        label = BANKNOTE_ALIAS_MAP.get(str(raw_name).strip().lower())
        if label is None:
            raise ValueError(f"Unsupported model class name: {raw_name!r}")
        mapping[int(cls_id)] = label
    if len(mapping) != len(VALID_BANKNOTE_NAMES) or set(mapping.values()) != VALID_BANKNOTE_NAMES:
        raise ValueError("Model classes must map exactly onto the seven supported denominations")
    return mapping


def overlap(b1: List[float], b2: List[float]) -> tuple:
    """(IoU, containment relative to the smaller box) of two boxes [x1, y1, x2, y2]."""
    inter = max(0.0, min(b1[2], b2[2]) - max(b1[0], b2[0])) * max(0.0, min(b1[3], b2[3]) - max(b1[1], b2[1]))
    a1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    a2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    union, min_area = a1 + a2 - inter, min(a1, a2)
    return (inter / union if union > 0 else 0.0), (inter / min_area if min_area > 0 else 0.0)


def is_valid_banknote_geometry(xyxy: List[float], img_w: int, img_h: int) -> bool:
    """
    Validate banknote geometry to discard tiny noise artifacts, extreme thin slivers,
    and invalid bounding boxes, while accommodating banknotes held at various angles
    and distances from the camera.
    """
    if img_w <= 0 or img_h <= 0:
        return False

    bw = xyxy[2] - xyxy[0]
    bh = xyxy[3] - xyxy[1]
    if bw <= 0 or bh <= 0:
        return False

    # Total area ratio of the box relative to camera frame
    area_ratio = (bw * bh) / float(img_w * img_h)

    # 1. Reject tiny speck noise (< 1.0% of frame)
    if area_ratio < 0.010:
        return False

    # 2. Reject full-screen scene / room / wall hallucinations
    # Banknotes have an aspect ratio of ~2.2:1. Even when held very close,
    # a banknote cannot simultaneously occupy >= 85% of width AND >= 80% of height,
    # nor can it cover > 82% of the entire camera screen.
    if (bw >= 0.85 * img_w and bh >= 0.80 * img_h) or area_ratio > 0.82:
        return False

    # 3. Reject invisible sub-dimension artifacts (< 3% in either dimension)
    if bw < 0.03 * img_w or bh < 0.03 * img_h:
        return False

    # 4. Reject extreme thin line slivers (> 4.5 aspect ratio)
    aspect_ratio = max(bw, bh) / max(min(bw, bh), 1.0)
    if aspect_ratio > 4.5:
        return False

    return True


def is_valid_banknote_color(crop_im) -> bool:
    """
    Validate that the detected region has rich color saturation typical of genuine currency.
    Discards monochrome white/gray walls, ceiling plaster, and blank desk surfaces (mean saturation < 36).
    Genuine Indonesian banknotes consistently display mean saturation > 48 across all denominations.
    """
    return float(np.asarray(crop_im.convert("HSV"))[..., 1].mean()) >= 36.0


def deduplicate_boxes(candidate_boxes: List[dict]) -> List[dict]:
    """
    Perform spatial Non-Maximum Suppression to ensure the same physical banknote is never
    reported as multiple overlapping boxes, while allowing multiple distinct banknotes
    held side-by-side or partially fanned out to be detected simultaneously.
    """
    sorted_candidates = sorted(candidate_boxes, key=lambda b: b.get("confidence", 0), reverse=True)
    kept_boxes = []

    for cand in sorted_candidates:
        cand_coords = cand["box_2d"]
        cand_label = cand.get("label")
        overlaps_existing = False

        for kept in kept_boxes:
            kept_label = kept.get("label")
            iou, containment = overlap(cand_coords, kept["box_2d"])

            if cand_label == kept_label:
                # Same denomination: only deduplicate if heavy overlap (same physical note)
                if iou > 0.45 or containment > 0.70:
                    overlaps_existing = True
                    break
            else:
                # Different denominations: only deduplicate if almost identical box (> 70% IoU)
                # Two distinct banknotes side-by-side or overlapping should NOT suppress each other
                if iou > 0.70 or containment > 0.85:
                    overlaps_existing = True
                    break

        if not overlaps_existing:
            kept_boxes.append(cand)

    return kept_boxes
