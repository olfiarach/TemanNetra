// In-browser banknote detection: a port of backend/main.py predict + backend/utils.py.
// Parity with the Python pipeline is checked by backend/web_parity.py.
import * as ort from 'onnxruntime-web';

const CONF = 0.45; // same as the backend's MODEL(conf=0.45, iou=0.45)
const IOU = 0.45;
const MAX_DET = 300;
const MIN_SATURATION = 36; // is_valid_banknote_color
const PAD = 114 / 255; // ultralytics letterbox fill

// ---------- pure functions (also run under Node by the parity check) ----------

/** Letterbox RGBA pixels into a 1x3xSxS float tensor, the way ultralytics does for fixed-size ONNX. */
export function preprocess({ data, width: w, height: h }, size) {
  const r = Math.min(size / w, size / h);
  const nw = Math.round(w * r);
  const nh = Math.round(h * r);
  const left = Math.round((size - nw) / 2 - 0.1);
  const top = Math.round((size - nh) / 2 - 0.1);
  const plane = size * size;
  const t = new Float32Array(3 * plane).fill(PAD);
  for (let y = 0; y < nh; y++) {
    // ponytail: nearest-neighbour when r != 1 (ultralytics uses bilinear); the scanner sends
    // frames already sized to `size`, so r == 1 in practice
    const sy = Math.min(h - 1, Math.floor(y / r));
    for (let x = 0; x < nw; x++) {
      const s = (sy * w + Math.min(w - 1, Math.floor(x / r))) * 4;
      const d = (y + top) * size + x + left;
      t[d] = data[s] / 255;
      t[plane + d] = data[s + 1] / 255;
      t[2 * plane + d] = data[s + 2] / 255;
    }
  }
  return { tensor: t, r, left, top };
}

function overlap(a, b) {
  const inter = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const a1 = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const a2 = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = a1 + a2 - inter;
  const minArea = Math.min(a1, a2);
  return { iou: union > 0 ? inter / union : 0, containment: minArea > 0 ? inter / minArea : 0 };
}

export function isValidGeometry([x1, y1, x2, y2], w, h) {
  if (w <= 0 || h <= 0) return false;
  const bw = x2 - x1;
  const bh = y2 - y1;
  if (bw <= 0 || bh <= 0) return false;
  const area = (bw * bh) / (w * h);
  if (area < 0.01) return false;
  if ((bw >= 0.85 * w && bh >= 0.8 * h) || area > 0.82) return false;
  if (bw < 0.03 * w || bh < 0.03 * h) return false;
  return Math.max(bw, bh) / Math.max(Math.min(bw, bh), 1) <= 4.5;
}

/** Mean HSV saturation (0-255, as PIL computes it) of an integer crop. */
export function meanSaturation({ data, width }, x1, y1, x2, y2) {
  let sum = 0;
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const i = (y * width + x) * 4;
      const mx = Math.max(data[i], data[i + 1], data[i + 2]);
      const mn = Math.min(data[i], data[i + 1], data[i + 2]);
      sum += mx === 0 ? 0 : Math.floor(((mx - mn) * 255) / mx);
    }
  }
  return sum / ((x2 - x1) * (y2 - y1));
}

export function deduplicate(boxes) {
  const kept = [];
  for (const c of [...boxes].sort((a, b) => b.confidence - a.confidence)) {
    const dup = kept.some((k) => {
      const { iou, containment } = overlap(c.box_2d, k.box_2d);
      return c.label === k.label ? iou > 0.45 || containment > 0.7 : iou > 0.7 || containment > 0.85;
    });
    if (!dup) kept.push(c);
  }
  return kept;
}

/**
 * YOLOv8 output [1, 4+nc, n] -> validated boxes in the backend predict() shape.
 * `image` is the RGBA frame that was letterboxed (used for geometry and colour checks).
 */
export function postprocess(out, n, nc, { r, left, top }, image, meta) {
  const { width: w, height: h } = image;
  const cands = [];
  for (let i = 0; i < n; i++) {
    let cls = 0;
    let score = out[4 * n + i];
    for (let c = 1; c < nc; c++) {
      const s = out[(4 + c) * n + i];
      if (s > score) { score = s; cls = c; }
    }
    if (score <= CONF) continue;
    const cx = out[i], cy = out[n + i], bw = out[2 * n + i], bh = out[3 * n + i];
    cands.push({ score, cls, xyxy: [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2] });
  }

  // Per-class NMS, as ultralytics non_max_suppression with agnostic=False
  cands.sort((a, b) => b.score - a.score);
  const nms = [];
  for (const c of cands) {
    if (nms.length >= MAX_DET) break;
    if (!nms.some((k) => k.cls === c.cls && overlap(k.xyxy, c.xyxy).iou > IOU)) nms.push(c);
  }

  const boxes = [];
  for (const { score, cls, xyxy } of nms) {
    if (score < meta.thresholds[cls]) continue;
    const [x1, y1, x2, y2] = [
      Math.min(w, Math.max(0, (xyxy[0] - left) / r)),
      Math.min(h, Math.max(0, (xyxy[1] - top) / r)),
      Math.min(w, Math.max(0, (xyxy[2] - left) / r)),
      Math.min(h, Math.max(0, (xyxy[3] - top) / r)),
    ];
    if (!isValidGeometry([x1, y1, x2, y2], w, h)) continue;
    const [cx1, cy1, cx2, cy2] = [Math.max(0, Math.trunc(x1)), Math.max(0, Math.trunc(y1)), Math.min(w, Math.trunc(x2)), Math.min(h, Math.trunc(y2))];
    if (cx2 > cx1 && cy2 > cy1 && meanSaturation(image, cx1, cy1, cx2, cy2) < MIN_SATURATION) continue;
    boxes.push({
      label: meta.labels[cls],
      confidence: Math.round(score * 1000) / 1000,
      box_2d: [x1, y1, x2, y2].map((v) => Math.round(v * 100) / 100),
      box_normalized: [x1 / w, y1 / h, x2 / w, y2 / h].map((v) => Math.round(v * 1e4) / 1e4),
    });
  }
  return deduplicate(boxes);
}

// ---------- runtime ----------

let detector;

if (typeof window !== 'undefined') {
  // ponytail: wasm from the version-pinned CDN, because Vite bundling of ort's wasm is fragile; self-host if offline use matters
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;
  ort.env.wasm.numThreads = 1; // GitHub Pages can't send COOP/COEP headers, so no wasm threads
}

/** Load model + metadata once. `base` is the URL prefix that holds model/. */
export function loadDetector(base, options = {}) {
  detector ??= (async () => {
    const meta = await (await fetch(`${base}model/meta.json`)).json();
    const session = await ort.InferenceSession.create(`${base}model/best.onnx`, { executionProviders: ['wasm'], ...options });
    return { meta, session };
  })();
  detector.catch(() => { detector = undefined; }); // allow a retry after a failed download
  return detector;
}

export async function detect(image) {
  const { meta, session } = await detector;
  const pre = preprocess(image, meta.imgsz);
  const { output0 } = await session.run({ images: new ort.Tensor('float32', pre.tensor, [1, 3, meta.imgsz, meta.imgsz]) });
  return postprocess(output0.data, output0.dims[2], output0.dims[1] - 4, pre, image, meta);
}
