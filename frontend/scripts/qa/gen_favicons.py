#!/usr/bin/env python3
"""Render the favicon/PWA icon set from the QA-verified public/logo.svg.

All rasters come from the same source vector via Chromium, so the favicon, the
touch icon, the PWA icons and the in-app mark stay pixel-consistent.

  python3 scripts/qa/gen_favicons.py
"""
from __future__ import annotations

import base64
import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SVG = ROOT / "public" / "logo.svg"
PUB = ROOT / "public"

# Android maskable icons are cropped to a circle by the launcher. The mark's own
# rounded card (8..120 of 128) sits inside the ~80% safe zone, so the safe
# version is re-padded to 128 with the page background instead of the card.
SAFE_PAD = 0.16  # of the final tile, per side


def html_for(svg_text: str, size: int, pad: float = 0.0, bg: str = "transparent") -> str:
    inner = f"<div style='padding:{pad * 100}%'><div style='padding:{pad * 100}%'>{svg_text}</div></div>"
    return (
        "<!doctype html><meta charset=utf-8>"
        "<style>html,body{margin:0;padding:0;background:%s}"
        "svg{display:block;width:100%%;height:100%%;overflow:visible}</style>"
        "%s" % (bg, inner)
    )


def render(page, svg_text: str, size: int, pad: float = 0.0, bg: str = "transparent") -> Image.Image:
    page.set_viewport_size({"width": size, "height": size})
    page.set_content(html_for(svg_text, size, pad, bg))
    return Image.open(io.BytesIO(page.screenshot(omit_background=(bg == "transparent")))).convert("RGBA")


def main() -> None:
    svg_text = SVG.read_text()
    with sync_playwright() as p:
        br = p.chromium.launch()
        page = br.new_page(device_scale_factor=1)

        # preferred icon: the raw SVG (browsers + Android adaptive)
        (PUB / "favicon.svg").write_text(svg_text)

        sizes = {
            "favicon-16.png": 16,
            "favicon-32.png": 32,
            "favicon-48.png": 48,
            "icon-192.png": 192,
            "icon-512.png": 512,
            "apple-touch-icon.png": 180,
        }
        tiles = {}
        for name, size in sizes.items():
            # iOS/Android home-screen icons must be opaque
            bg = "#eef0f4" if name == "apple-touch-icon.png" else "transparent"
            im = render(page, svg_text, size, 0.0, bg)
            if bg != "transparent":
                im = Image.alpha_composite(Image.new("RGBA", im.size, bg), im)
            im.save(PUB / name)
            tiles[name] = im
            print(f"{name:<22} {size}x{size}")

        # maskable: same art, extra margin, opaque page background
        for size in (192, 512):
            im = render(page, svg_text, size, SAFE_PAD, "#eef0f4")
            im = Image.alpha_composite(Image.new("RGBA", im.size, "#eef0f4"), im)
            im.save(PUB / f"icon-{size}-maskable.png")
            print(f"icon-{size}-maskable.png  {size}x{size} (safe-zone padded)")

        # multi-resolution .ico for legacy tabs
        ico_sizes = [(16, 16), (32, 32), (48, 48)]
        base = tiles["favicon-48.png"]
        base.save(PUB / "favicon.ico", sizes=ico_sizes, append_images=[
            tiles["favicon-16.png"], tiles["favicon-32.png"], base][:3])
        print(f"favicon.ico            {', '.join(f'{w}x{h}' for w, h in ico_sizes)}")
        br.close()


if __name__ == "__main__":
    main()
