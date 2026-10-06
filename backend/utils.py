import io
import base64
from collections import Counter
from typing import List, Dict, Union, Optional
from gtts import gTTS

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

# Mapping for string aliases (from dataset.yaml, Roboflow, Kaggle, nominal numbers)
BANKNOTE_ALIAS_MAP: Dict[str, str] = {
    # Dataset shorthand notation
    "1k": "Satu Ribu",
    "2k": "Dua Ribu",
    "5k": "Lima Ribu",
    "10k": "Sepuluh Ribu",
    "20k": "Dua Puluh Ribu",
    "50k": "Lima Puluh Ribu",
    "100k": "Seratus Ribu",
    # Full nominal strings
    "1000": "Satu Ribu",
    "2000": "Dua Ribu",
    "5000": "Lima Ribu",
    "10000": "Sepuluh Ribu",
    "20000": "Dua Puluh Ribu",
    "50000": "Lima Puluh Ribu",
    "100000": "Seratus Ribu",
    "rp 1000": "Satu Ribu",
    "rp 2000": "Dua Ribu",
    "rp 5000": "Lima Ribu",
    "rp 10000": "Sepuluh Ribu",
    "rp 20000": "Dua Puluh Ribu",
    "rp 50000": "Lima Puluh Ribu",
    "rp 100000": "Seratus Ribu",
    "rp 1.000": "Satu Ribu",
    "rp 2.000": "Dua Ribu",
    "rp 5.000": "Lima Ribu",
    "rp 10.000": "Sepuluh Ribu",
    "rp 20.000": "Dua Puluh Ribu",
    "rp 50.000": "Lima Puluh Ribu",
    "rp 100.000": "Seratus Ribu",
    # Spoken names (case-insensitive)
    "satu ribu": "Satu Ribu",
    "dua ribu": "Dua Ribu",
    "lima ribu": "Lima Ribu",
    "sepuluh ribu": "Sepuluh Ribu",
    "dua puluh ribu": "Dua Puluh Ribu",
    "lima puluh ribu": "Lima Puluh Ribu",
    "seratus ribu": "Seratus Ribu",
}

# Standard 0-6 index mapping for custom banknote models
INDEX_TO_BANKNOTE: Dict[int, str] = {
    0: "Satu Ribu",
    1: "Dua Ribu",
    2: "Lima Ribu",
    3: "Sepuluh Ribu",
    4: "Dua Puluh Ribu",
    5: "Lima Puluh Ribu",
    6: "Seratus Ribu",
}

# Alphabetical 0-6 index mapping (e.g. ['1000', '10000', '100000', '2000', '20000', '5000', '50000'])
ALPHABETICAL_INDEX_TO_BANKNOTE: Dict[int, str] = {
    0: "Satu Ribu",
    1: "Sepuluh Ribu",
    2: "Seratus Ribu",
    3: "Dua Ribu",
    4: "Dua Puluh Ribu",
    5: "Lima Ribu",
    6: "Lima Puluh Ribu",
}

# Keep CLASS_NAMES for backward compatibility
CLASS_NAMES = BANKNOTE_ALIAS_MAP


def resolve_label_name(cls_id: int, model_names: dict) -> Optional[str]:
    """
    Resolve a class ID or name to its Indonesian spoken denomination.
    Returns None if the detected object is NOT a banknote (e.g. face, person, or COCO object).
    """
    if not model_names:
        return None

    raw_name = model_names.get(cls_id)
    if raw_name is None:
        return None

    str_name = str(raw_name).strip()
    lower_name = str_name.lower()

    # 1. Strictly ignore person, face, head, or human body parts
    if any(k in lower_name for k in ["person", "face", "head", "human"]):
        return None

    # 2. Check if raw_name directly matches any known banknote alias
    if lower_name in BANKNOTE_ALIAS_MAP:
        return BANKNOTE_ALIAS_MAP[lower_name]

    if str_name in VALID_BANKNOTE_NAMES:
        return str_name

    # 3. If model_names is a COCO model (80 classes, class 0 is 'person'), reject all non-banknotes
    is_coco_model = len(model_names) == 80 or model_names.get(0) == "person"
    if is_coco_model:
        return None

    # 4. Fallback for custom banknote-only model (<= 7 classes)
    if len(model_names) <= 7:
        if cls_id in ALPHABETICAL_INDEX_TO_BANKNOTE:
            return ALPHABETICAL_INDEX_TO_BANKNOTE[cls_id]
        if cls_id in INDEX_TO_BANKNOTE:
            return INDEX_TO_BANKNOTE[cls_id]

    return None


def compute_iou(b1: List[float], b2: List[float]) -> float:
    """Compute Intersection over Union (IoU) between two bounding boxes [x1, y1, x2, y2]."""
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2])
    y2 = min(b1[3], b2[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    a1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    a2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0 else 0.0


def compute_containment(b1: List[float], b2: List[float]) -> float:
    """Compute overlap ratio relative to the smaller bounding box."""
    x1 = max(b1[0], b2[0])
    y1 = max(b1[1], b2[1])
    x2 = min(b1[2], b2[2])
    y2 = min(b1[3], b2[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    a1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    a2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    min_area = min(a1, a2)
    return inter / min_area if min_area > 0 else 0.0


AUDIO_CACHE: Dict[str, str] = {}


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
    try:
        import numpy as np
        hsv_arr = np.array(crop_im.convert("HSV"))
        mean_sat = float(hsv_arr[:, :, 1].mean())
        return mean_sat >= 36.0
    except Exception:
        return True


def deduplicate_boxes(candidate_boxes: List[dict], iou_threshold: float = 0.45, containment_threshold: float = 0.70) -> List[dict]:
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
            kept_coords = kept["box_2d"]
            kept_label = kept.get("label")
            iou = compute_iou(cand_coords, kept_coords)
            containment = compute_containment(cand_coords, kept_coords)

            if cand_label == kept_label:
                # Same denomination: only deduplicate if heavy overlap (same physical note)
                if iou > iou_threshold or containment > containment_threshold:
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


def format_detected_speech(detected_notes: List[str]) -> str:
    """
    Format detected notes list into natural, grammatical Indonesian speech text.
    Groups identical denominations into count units (e.g. 'satu lembar Dua Puluh Ribu')
    so a single note is never repeated as 'Dua Puluh Ribu, Dua Puluh Ribu'.
    """
    if not detected_notes:
        return "Uang tidak terdeteksi. Silakan coba lagi."

    counts = Counter(detected_notes)
    num_words = {
        1: "satu lembar",
        2: "dua lembar",
        3: "tiga lembar",
        4: "empat lembar",
        5: "lima lembar",
    }

    phrases = []
    for note, count in counts.items():
        prefix = num_words.get(count, f"{count} lembar")
        phrases.append(f"{prefix} {note}")

    return f"Terdeteksi {' dan '.join(phrases)} Rupiah."


def generate_audio_base64(text: str, lang: str = "id") -> Optional[str]:
    """
    Generate audio via gTTS and return base64 encoded string.
    Uses memory cache and handles rate limiting safely so API never fails.
    """
    if not text:
        return None

    if text in AUDIO_CACHE:
        return AUDIO_CACHE[text]

    try:
        tts = gTTS(text=text, lang=lang)
        audio_io = io.BytesIO()
        tts.write_to_fp(audio_io)
        b64 = base64.b64encode(audio_io.getvalue()).decode("utf-8")
        AUDIO_CACHE[text] = b64
        return b64
    except Exception as e:
        # Gracefully fall back to client-side SpeechSynthesis if gTTS is rate-limited or offline
        return None
