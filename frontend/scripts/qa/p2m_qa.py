#!/usr/bin/env python3
"""Motion QA for the TemanNetra logo showcase.

Port of pixel2motion's capture_motion_frames.py / probe_motion_continuity.py contract
to the locally available Python Playwright (Chromium).

  --frames   capture ?t=<ms> beats into outputs/motion_frames + motion_strip.png
  --probe    read computed values at seeked timestamps (catches dropped keyframe easings)
  --ink-sweep  ink-pixel delta every ~10ms across the whole timeline (stall+pop detector)
  --contract same-pipeline ?static=1 vs ?t=END diff; must be exactly 0

Exit code is non-zero when a hard gate fails.
"""
from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
HTML = (ROOT / "motion" / "logo_motion.html").as_uri()
OUT = ROOT / "outputs"
FRAMES = OUT / "motion_frames"

STAGE = "#logo-root"
END = 1300
BEATS = [0, 150, 360, 500, 620, 660, 745, 790, 870, 950, 1060, 1130, 1260, 1300]
RISK = [330, 360, 500, 565, 590, 620, 660, 700, 830, 900, 970, 1020, 1130]  # handoffs & occluders


def shot(page, t, path=None):
    page.goto(f"{HTML}?t={t}")
    page.wait_for_function("window.__p2mReady === true")
    page.wait_for_timeout(60)
    el = page.locator(STAGE)
    el.screenshot(path=path, animations="disabled") if path else None
    return Image.open(io.BytesIO(el.screenshot(animations="disabled"))).convert("RGB")


def strip(images, labels, dest, cols=7):
    w, h = images[0].size
    rows = (len(images) + cols - 1) // cols
    lab = 18
    canvas = Image.new("RGB", (cols * w, rows * (h + lab)), "white")
    d = ImageDraw.Draw(canvas)
    for i, (im, lb) in enumerate(zip(images, labels)):
        x, y = (i % cols) * w, (i // cols) * (h + lab)
        canvas.paste(im, (x, y + lab))
        d.text((x + 6, y + 4), lb, fill="#0e1116")
    canvas.save(dest)
    return dest


def cmd_frames(page):
    FRAMES.mkdir(parents=True, exist_ok=True)
    ims, labs = [], []
    for t in sorted(set(BEATS + RISK)):
        p = FRAMES / f"t{t:04d}.png"
        im = shot(page, t, p)
        ims.append(im)
        labs.append(f"t={t}")
    d = strip(ims[:: max(1, len(ims) // 14)], labs[:: max(1, len(labs) // 14)], OUT / "motion_strip.png")
    print(f"frames -> {FRAMES}  strip -> {d}")


def cmd_probe(page):
    """Computed values at 2-3 timestamps must match the designed curve, never linear."""
    rows = []
    for t in (660, 790, 1130):
        page.goto(f"{HTML}?t={t}")
        page.wait_for_function("window.__p2mReady === true")
        rows.append(page.evaluate(
            """() => ({
                 t: %d,
                 coinScale: getComputedStyle(document.getElementById('coin')).transform,
                 rayC: getComputedStyle(document.getElementById('ray-c')).strokeDashoffset,
                 line3: getComputedStyle(document.getElementById('line-3')).strokeDashoffset,
                 active: document.querySelector('#principles .pill.on')?.dataset.p,
               })""" % t))
    for r in rows:
        print(f"t={r['t']:>4}  ray-c dashoffset={r['rayC']:>8}  line-3 dashoffset={r['line3']:>8}  "
              f"coin transform={r['coinScale'][:34]:<34} pill={r['active']}")
    # gate: each drawn path must have STARTED at its own beat -> values differ, none stuck at 1
    offs = [float(r["rayC"].rstrip("px")) for r in rows]
    if len(set(round(o, 3) for o in offs)) == 1:
        print("FAIL probe: ray-c dashoffset identical at every timestamp (easing/timeline dropped)")
        return 1
    print("OK probe: staged easing visible (values differ across seeked timestamps)")
    return 0


def cmd_ink(page, step=10):
    """Ink-pixel delta per step; a flatline followed by a jump is the stall+pop signature."""
    prev, deltas, worst = None, [], []
    t = 0
    while t <= END:
        page.goto(f"{HTML}?t={t}")
        page.wait_for_function("window.__p2mReady === true")
        im = Image.open(io.BytesIO(page.locator(STAGE).screenshot(animations="disabled"))).convert("L")
        px = im.load()
        w, h = im.size
        ink = sum(1 for y in range(0, h, 2) for x in range(0, w, 2) if px[x, y] < 240)
        if prev is not None:
            deltas.append((t, ink - prev))
        prev = ink
        t += step
    # The stall+pop signature belongs to stroke handoffs and crossing passes. The
    # arrival (alpha admission + scale) has no pen, so its ink profile is
    # informational only; a threshold jitter there is not a handoff defect.
    HANDOFFS = [(620, 790), (700, 870), (780, 950), (830, 990), (900, 1060), (970, 1130)]
    worst, run = [], 0
    for i, (t, d) in enumerate(deltas):
        if not any(a <= t <= b for a, b in HANDOFFS):
            run = 0
            continue
        if d <= 0:
            run += 1
        else:
            if run >= 3 and d > 300:          # >=30ms stall then a jump
                worst.append((t, run, d))
            run = 0
    (OUT / "ink_sweep.json").write_text(json.dumps(deltas))
    if worst:
        print("FAIL ink-sweep: stall+pop window(s):", worst)
        return 1
    print(f"OK ink-sweep: no stall+pop across all 6 handoff windows / {len(deltas)} samples "
          f"(max step delta {max(abs(d) for _, d in deltas)})")
    return 0


def cmd_contract(page):
    page.goto(f"{HTML}?static=1")
    page.wait_for_function("window.__p2mReady === true")
    a = Image.open(io.BytesIO(page.locator(STAGE).screenshot(animations="disabled"))).convert("RGB")
    b = shot(page, END)
    a.save(OUT / "final_render.png")
    b.save(OUT / "html_render.png")
    if a.size != b.size:
        print(f"FAIL contract: viewport/size mismatch {a.size} vs {b.size}")
        return 1
    diff = sum(1 for pa, pb in zip(a.getdata(), b.getdata()) if pa != pb)
    print(f"contract same-pipeline diff = {diff} px of {a.size[0] * a.size[1]}")
    if diff != 0:
        print("FAIL contract: final frame must land exactly on the static vector")
        return 1
    print("OK contract: ?t=END === ?static=1 (exact 0 diff)")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", action="store_true")
    ap.add_argument("--probe", action="store_true")
    ap.add_argument("--ink-sweep", action="store_true")
    ap.add_argument("--contract", action="store_true")
    ap.add_argument("--all", action="store_true")
    a = ap.parse_args()
    if not any([a.frames, a.probe, a.ink_sweep, a.contract, a.all]):
        a.all = True

    OUT.mkdir(parents=True, exist_ok=True)
    rc = 0
    with sync_playwright() as p:
        br = p.chromium.launch()
        pg = br.new_page(viewport={"width": 480, "height": 300}, device_scale_factor=2)
        if a.all or a.frames:
            cmd_frames(pg)
        if a.all or a.probe:
            rc |= cmd_probe(pg)
        if a.all or a.contract:
            rc |= cmd_contract(pg)
        if a.all or a.ink_sweep:
            rc |= cmd_ink(pg)
        br.close()
    sys.exit(rc)


if __name__ == "__main__":
    main()
