"""QR poster (Poster.png uslubi): 1600×1600 PNG — ko'k fon, logo, nomi, oq kartochkada QR, @bot.
Kabinetdagi poster (webapp/src/owner/poster.ts) bilan bir xil ko'rinish."""
from __future__ import annotations

import io
import os

import qrcode
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from qrcode.constants import ERROR_CORRECT_Q

BLUE = (30, 111, 217)  # #1E6FD9
QR_INK = (15, 61, 122)  # #0F3D7A
GREEN = (34, 181, 115)
SIZE = 1600
K = SIZE / 1080  # web posterdagi o'lchamlardan masshtab

_FONT_DIRS = ["/usr/share/fonts/truetype/dejavu", "C:/Windows/Fonts", "/Library/Fonts", "/System/Library/Fonts/Supplemental"]
_BOLD = ["DejaVuSans-Bold.ttf", "segoeuib.ttf", "arialbd.ttf", "Arial Bold.ttf"]
_REGULAR = ["DejaVuSans.ttf", "segoeui.ttf", "arial.ttf", "Arial.ttf"]


def _font(names: list[str], size: int):
    for d in _FONT_DIRS:
        for n in names:
            p = os.path.join(d, n)
            if os.path.isfile(p):
                return ImageFont.truetype(p, size)
    return ImageFont.load_default(size=size)


def _s(v: float) -> int:
    return int(round(v * K))


def _fit(draw, text: str, names, max_size: int, min_size: int, width: int):
    size = max_size
    while size > min_size:
        f = _font(names, size)
        if draw.textlength(text, font=f) <= width:
            return f
        size -= 2
    return _font(names, min_size)


def _wrap(draw, text: str, font, width: int) -> list[str]:
    lines, cur = [], ""
    for w in text.split():
        t = f"{cur} {w}".strip()
        if draw.textlength(t, font=font) <= width or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > 2:
        lines = lines[:2]
        lines[1] = lines[1].rsplit(" ", 1)[0] + "…"
    return lines


def _center(draw, y: int, text: str, font, fill):
    w = draw.textlength(text, font=font)
    draw.text(((SIZE - w) / 2, y), text, font=font, fill=fill, anchor="ls")


def _logo(draw, x: int, y: int, h: int):
    """Pin + ochiq kitob (soddalashtirilgan)."""
    k = h / 120
    cx, cy, r = x + 50 * k, y + 46 * k, 42 * k
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill="white")
    draw.polygon([(cx - r * 0.8, cy + r * 0.55), (cx + r * 0.8, cy + r * 0.55), (cx, y + 116 * k)], fill="white")
    ri = 27 * k
    draw.ellipse([cx - ri, cy - ri, cx + ri, cy + ri], fill=BLUE)
    draw.polygon([(x + 33 * k, y + 37 * k), (x + 49 * k, y + 37.5 * k), (x + 49 * k, y + 58 * k), (x + 33 * k, y + 57 * k)], fill="white")
    draw.polygon([(x + 67 * k, y + 37 * k), (x + 51 * k, y + 37.5 * k), (x + 51 * k, y + 58 * k), (x + 67 * k, y + 57 * k)], fill="white")
    g = 10 * k
    draw.ellipse([x + 80 * k - g, y + 16 * k - g, x + 80 * k + g, y + 16 * k + g], fill=GREEN)


def _telegram(draw, cx: float, cy: float, r: float):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill="white")
    s = r / 24
    pts = [(-12, 1), (13, -10), (8, 12), (1, 6), (-3, 11), (-3, 4), (8, -5), (-5, 3)]
    draw.polygon([(cx + px * s, cy + py * s) for px, py in pts], fill=BLUE)


def qr_image(link: str, size: int) -> Image.Image:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, border=0, box_size=10)
    qr.add_data(link)
    qr.make(fit=True)
    img = qr.make_image(fill_color=QR_INK, back_color="white").convert("RGB")
    return img.resize((size, size), Image.NEAREST)


def make_poster(title: str, link: str, bot_username: str, subtitle: str = "Bepul sinov darsiga yoziling") -> bytes:
    img = Image.new("RGB", (SIZE, SIZE), BLUE)
    d = ImageDraw.Draw(img, "RGBA")
    # yumshoq dog'lar
    d.ellipse([_s(20 - 150), _s(330 - 150), _s(20 + 150), _s(330 + 150)], fill=(255, 255, 255, 18))
    d.ellipse([_s(1000 - 260), _s(900 - 260), _s(1000 + 260), _s(900 + 260)], fill=(255, 255, 255, 18))

    # Logo + YaqinDars
    brand = _font(_BOLD, _s(64))
    bw = d.textlength("YaqinDars", font=brand)
    logo_h = _s(64)
    total = logo_h * 100 / 120 + _s(18) + bw
    x0 = (SIZE - total) / 2
    _logo(d, int(x0), _s(52), logo_h)
    d.text((x0 + logo_h * 100 / 120 + _s(18), _s(106)), "YaqinDars", font=brand, fill="white", anchor="ls")

    # Nomi (1–2 qator) va izoh
    tfont = _fit(d, title, _BOLD, _s(66), _s(44), SIZE - _s(140))
    y = _s(222)
    for line in _wrap(d, title, tfont, SIZE - _s(140)):
        _center(d, y, line, tfont, "white")
        y += tfont.size + _s(6)
    _center(d, y + _s(6), subtitle, _font(_REGULAR, _s(30)), (235, 242, 252))

    # QR kartochka (soya bilan)
    card = _s(520)
    card_y = max(y + _s(40), _s(300))
    cx = (SIZE - card) // 2
    shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([cx, card_y + _s(12), cx + card, card_y + card + _s(12)], radius=_s(48), fill=(9, 40, 90, 90))
    img.paste(shadow.filter(ImageFilter.GaussianBlur(_s(20))), (0, 0), shadow.filter(ImageFilter.GaussianBlur(_s(20))))
    d = ImageDraw.Draw(img, "RGBA")
    d.rounded_rectangle([cx, card_y, cx + card, card_y + card], radius=_s(48), fill="white")
    qs = card - _s(48) * 2
    img.paste(qr_image(link, qs), (cx + (card - qs) // 2, card_y + (card - qs) // 2))

    # @bot
    handle = f"@{bot_username}"
    hfont = _fit(d, handle, _BOLD, _s(76), _s(48), SIZE - _s(260))
    hy = card_y + card + _s(110)
    hw = d.textlength(handle, font=hfont)
    icon = hfont.size * 0.55
    sx = (SIZE - (hw + icon * 2 + _s(24))) / 2
    _telegram(d, sx + icon, hy - hfont.size * 0.34, icon)
    d.text((sx + icon * 2 + _s(24), hy), handle, font=hfont, fill="white", anchor="ls")

    _center(d, SIZE - _s(50), "Skanerlang — bepul sinov darsiga yoziling", _font(_REGULAR, _s(34)), (245, 248, 255))

    out = io.BytesIO()
    img.save(out, "PNG", optimize=True, dpi=(200, 200))
    return out.getvalue()
