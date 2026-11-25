#!/usr/bin/env python3
"""Encode clue images to a phone/desktop-appropriate size.

WebP at 1000px (long side) and quality 75 matches JPEG quality ~85 at clue
display size (phone ~360px CSS*2, desktop ~350px CSS*2) while staying well
under the GitHub Pages 1 GB cap once later-season games are added.
"""
from __future__ import annotations
import io
from pathlib import Path
from PIL import Image

MAX_SIDE = 1000
QUALITY = 75
EXT = 'webp'
FORMAT = 'WEBP'

def encode_image(im: Image.Image, dest: Path) -> Path:
    im = im.convert('RGB')
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    dest = Path(dest)
    if dest.suffix.lower() != f'.{EXT}':
        dest = dest.with_suffix(f'.{EXT}')
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, format=FORMAT, quality=QUALITY, method=6)
    return dest

def encode_bytes(data: bytes, dest: Path) -> Path:
    with Image.open(io.BytesIO(data)) as im:
        return encode_image(im, dest)

def encode_file(src: Path, dest: Path | None = None) -> Path:
    dest = Path(dest) if dest else Path(src).with_suffix(f'.{EXT}')
    with Image.open(src) as im:
        return encode_image(im, dest)
