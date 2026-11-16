"""Markaz QR posteri: 1200×1500 PNG (chop etishga tayyor) — brend rangi, markaz nomi, @bot."""
from __future__ import annotations

import io
import os

import qrcode
from PIL import Image, ImageDraw, ImageFont
from qrcode.constants import ERROR_CORRECT_Q

BRAND = (15, 61, 122)  # #0F3D7A
INK = (17, 24, 39)
MUTED = (90, 100, 115)
W, H = 1200, 1500

_FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "C:/Windows/Fonts", "/Library/Fonts", "/System/Library/Fonts/Supplemental"]
_BOLD = ["DejaVuSans-Bold.ttf", "arialbd.ttf", "segoeuib.ttf", "Arial Bold.ttf"]
_REGULAR = ["DejaVuSans.ttf", "arial.ttf", "segoeui.ttf", "Arial.ttf"]


def _font(names: list[str], size: int):
    for d in _FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.isfile(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default(size=size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, max_w: int, max_lines: int = 2) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while draw.textlength(lines[-1] + "…", font=font) > max_w and lines[-1]:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    return lines


def _center_text(draw, y: int, text: str, font, fill) -> int:
    w = draw.textlength(text, font=font)
    draw.text(((W - w) / 2, y), text, font=font, fill=fill)
    bbox = font.getbbox(text)
    return y + (bbox[3] - bbox[1])


def qr_image(link: str, size: int) -> Image.Image:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, border=0, box_size=10)
    qr.add_data(link)
    qr.make(fit=True)
    img = qr.make_image(fill_color=BRAND, back_color="white").convert("RGB")
    return img.resize((size, size), Image.NEAREST)


def make_poster(title: str, link: str, bot_username: str, subtitle: str = "Bepul sinov darsiga yoziling") -> bytes:
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    # Yuqori brend chizig'i
    d.rectangle([0, 0, W, 230], fill=BRAND)
    _center_text(d, 62, "YaqinDars", _font(_BOLD, 84), "white")
    _center_text(d, 166, "Yaqin atrofdagi o‘quv markazlari", _font(_REGULAR, 38), (210, 225, 245))

    # Markaz nomi
    name_font = _font(_BOLD, 64)
    y = 290
    for line in _wrap(d, title, name_font, W - 160):
        y = _center_text(d, y, line, name_font, INK) + 18
    y = _center_text(d, y + 22, subtitle, _font(_REGULAR, 40), MUTED) + 50

    # QR (ramka bilan)
    size = min(700, H - y - 260)
    x0 = (W - size) // 2
    d.rounded_rectangle([x0 - 36, y - 36, x0 + size + 36, y + size + 36], radius=40, outline=BRAND, width=8)
    img.paste(qr_image(link, size), (x0, y))
    y += size + 36 + 54

    _center_text(d, y, "Telefon kamerasi bilan skanerlang", _font(_REGULAR, 40), MUTED)
    _center_text(d, y + 66, f"@{bot_username}", _font(_BOLD, 60), BRAND)

    out = io.BytesIO()
    img.save(out, "PNG", optimize=True, dpi=(150, 150))
    return out.getvalue()
