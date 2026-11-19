#!/usr/bin/env python3
"""Build platform-specific icons from the RPM image supplied by the creator.

The Base64 source is a 160×160 WebP resampling of the original 1254×1254
uploaded PNG (same black, yellow and white logo; no generated replacement).
"""
from __future__ import annotations

import argparse
import base64
import hashlib
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "rpm-original-user-icon.webp.b64"
OUT = ROOT / "build"
ICON_PNG = OUT / "icon.png"
ICON_ICO = OUT / "icon.ico"

EXPECTED_SHA256 = "9f9c01a06004723a1b9c053af0a64746b4c25ab689801442cd307ad239f50121"
SIZES = ((16, 16), (24, 24), (32, 32), (48, 48),
         (64, 64), (128, 128), (256, 256))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    raw = base64.b64decode(SOURCE.read_text(encoding="ascii").strip(), validate=True)
    digest = hashlib.sha256(raw).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"RPM image checksum mismatch: {digest}")

    with Image.open(BytesIO(raw)) as src:
        if src.size != (160, 160) or src.format != "WEBP":
            raise SystemExit(f"Unexpected RPM source image format/size: {src.format} {src.size}")
        icon = src.convert("RGBA").resize((256, 256), Image.Resampling.LANCZOS)

    if args.verify:
        with Image.open(ICON_PNG) as png:
            if png.size != (256, 256) or png.format != "PNG":
                raise SystemExit("Desktop app PNG icon missing or invalid")
        with Image.open(ICON_ICO) as ico:
            if ico.format != "ICO":
                raise SystemExit("Windows installer icon missing or invalid")
            available = set(ico.info.get("sizes", ()))
            if not {(16, 16), (32, 32), (48, 48), (256, 256)}.issubset(available):
                raise SystemExit(f"Windows ICO does not contain expected sizes: {available}")
        print("RPM game icon verified for app window, installer and desktop shortcut")
        return

    OUT.mkdir(exist_ok=True)
    icon.save(ICON_PNG, format="PNG", optimize=True)
    icon.save(ICON_ICO, format="ICO", sizes=SIZES)
    print(f"Generated {ICON_PNG} and {ICON_ICO} from creator-supplied RPM logo")


if __name__ == "__main__":
    main()
