"""Matn parserlari (kunlar, vaqt, narx, telefon). Tashqi kutubxonasiz — testlash oson."""
import re

DAY_ORDER = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"]
DAY_NAMES = {
    "Du": "dushanba",
    "Se": "seshanba",
    "Ch": "chorshanba",
    "Pa": "payshanba",
    "Ju": "juma",
    "Sh": "shanba",
    "Ya": "yakshanba",
}
_SKIP_WORDS = {"va", "hamda", "kunlari", "kuni"}


def _day_code(token: str):
    if len(token) < 2:
        return None
    for code, full in DAY_NAMES.items():
        # "du", "dush", "dushanba" — hammasi qabul qilinadi
        if full.startswith(token) or token == full:
            return code
    return None


def parse_days(text: str):
    """'Du, Ch, Ju' / 'dushanba, juma' / 'Se-Pa-Sh' -> ['Du', 'Ch', 'Ju']. Xato bo'lsa None."""
    tokens = [t for t in re.split(r"[\s,;/.\-–—+]+", (text or "").lower()) if t]
    out = []
    for t in tokens:
        if t in _SKIP_WORDS:
            continue
        code = _day_code(t)
        if not code:
            return None
        if code not in out:
            out.append(code)
    return sorted(out, key=DAY_ORDER.index) or None


def parse_time(text: str):
    """'16:00-17:30' / '9.00 – 10.30' -> '16:00–17:30' (tugash boshlanishdan keyin bo'lishi shart)."""
    m = re.fullmatch(r"\s*(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*", text or "")
    if not m:
        return None
    h1, m1, h2, m2 = map(int, m.groups())
    if not (0 <= h1 < 24 and 0 <= h2 < 24 and m1 < 60 and m2 < 60):
        return None
    if h2 * 60 + m2 <= h1 * 60 + m1:
        return None
    return f"{h1:02d}:{m1:02d}–{h2:02d}:{m2:02d}"


def parse_int(text: str, lo: int, hi: int):
    """'250 000 so‘m' -> 250000. Oraliqdan tashqarida yoki manfiy bo'lsa None."""
    t = (text or "").strip()
    if t.startswith("-"):
        return None
    if not re.fullmatch(r"[\d\s.,']+(so[‘'`ʻ]?m)?", t, flags=re.IGNORECASE):
        return None
    digits = re.sub(r"\D", "", t)
    if not digits:
        return None
    n = int(digits)
    return n if lo <= n <= hi else None


def normalize_phone(raw: str):
    """'+998 90 123-45-67' / '998901234567' / '901234567' -> '+998901234567'. Xato bo'lsa None."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 9:
        digits = "998" + digits
    phone = "+" + digits
    return phone if re.fullmatch(r"\+998\d{9}", phone) else None
