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


# ---------------- Mini App: markazni ro'yxatdan o'tkazish ----------------
import json  # noqa: E402

TARIFF_PRICES = {"oddiy": 75_000, "vip": 150_000}  # tarif nomlari (oddiy narxi turiga bog'liq — tariff_price)
KIND_PRICES = {"center": 75_000, "tutor": 45_000}  # Oddiy tarif: o'quv markazi / repetitor
TRIAL_DAYS = 15


def tariff_price(kind, tariff) -> int:
    """webapp/config.ts tariffPrice bilan bir xil: VIP 150 000, aks holda markaz 75 000 / repetitor 45 000."""
    if tariff == "vip":
        return TARIFF_PRICES["vip"]
    return KIND_PRICES["tutor" if kind == "tutor" else "center"]
_TIME_RE = re.compile(r"(\d{2}):(\d{2})–(\d{2}):(\d{2})")


class RegError(ValueError):
    """Foydalanuvchiga ko'rsatiladigan xato matni bilan."""


def _s(v, lo: int, hi: int, what: str, required: bool = True) -> str:
    if v is None or v == "":
        if required:
            raise RegError(f"{what} ko‘rsatilmagan")
        return ""
    if not isinstance(v, str):
        raise RegError(f"{what} noto‘g‘ri")
    v = " ".join(v.split())  # ortiqcha bo'shliq va yangi qatorlar
    if not lo <= len(v) <= hi:
        raise RegError(f"{what} {lo}–{hi} belgi bo‘lsin")
    return v


def _int(v, lo: int, hi: int, what: str, allow_none: bool = False):
    if v is None and allow_none:
        return None
    if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
        raise RegError(f"{what} noto‘g‘ri")
    return v


def parse_registration(raw: str) -> dict:
    """Mini App sendData JSON -> Firestore hujjati uchun toza dict. Xato bo'lsa RegError."""
    if not raw or len(raw.encode()) > 4096:
        raise RegError("Ma’lumot juda katta yoki bo‘sh")
    try:
        d = json.loads(raw)
    except ValueError:
        raise RegError("Ma’lumotni o‘qib bo‘lmadi") from None
    if not isinstance(d, dict) or d.get("v") != 1:
        raise RegError("Ilova versiyasi eskirgan — Mini App’ni qayta oching")

    tariff = d.get("t")
    if tariff not in TARIFF_PRICES:
        raise RegError("Tarif tanlanmagan")
    kind = d.get("k") if d.get("k") in ("center", "tutor") else "center"

    phone = normalize_phone(d.get("p") if isinstance(d.get("p"), str) else "")
    if not phone:
        raise RegError("Telefon raqam noto‘g‘ri")

    lat, lng = d.get("la"), d.get("lo")
    if not all(isinstance(x, (int, float)) and not isinstance(x, bool) for x in (lat, lng)):
        raise RegError("Joylashuv ko‘rsatilmagan")
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        raise RegError("Joylashuv noto‘g‘ri")

    age_from = _int(d.get("af"), 2, 60, "Yosh", allow_none=True)
    age_to = _int(d.get("at"), 2, 60, "Yosh", allow_none=True)
    if age_from and age_to and age_from > age_to:
        age_from, age_to = age_to, age_from

    amenities = d.get("am") or []
    if not isinstance(amenities, list):
        raise RegError("Sharoitlar noto‘g‘ri")
    amenities = [_s(a, 1, 30, "Sharoit") for a in amenities[:8]]

    raw_groups = d.get("g")
    if not isinstance(raw_groups, list) or not 1 <= len(raw_groups) <= 10:
        raise RegError("Kamida 1 ta, ko‘pi bilan 10 ta guruh bo‘lsin")
    groups = []
    for g in raw_groups:
        if not isinstance(g, list) or len(g) != 5:
            raise RegError("Guruh ma’lumoti noto‘g‘ri")
        subject = _s(g[0], 2, 40, "Fan")
        days = parse_days(g[1]) if isinstance(g[1], str) else None
        if not days:
            raise RegError(f"«{subject}»: dars kunlari noto‘g‘ri")
        time = parse_time(g[2].replace("–", "-")) if isinstance(g[2], str) else None
        if not time:
            raise RegError(f"«{subject}»: vaqt noto‘g‘ri")
        price = _int(g[3], 10_000, 10_000_000, f"«{subject}» narxi")
        seats = _int(g[4], 0, 100, f"«{subject}» bo‘sh joylari")
        groups.append({"subject": subject, "days": days, "time": time, "price": price, "freeSeats": seats})

    raw_teachers = d.get("tc") or []
    if not isinstance(raw_teachers, list) or len(raw_teachers) > 10:
        raise RegError("O‘qituvchilar ro‘yxati noto‘g‘ri")
    teachers = []
    for t in raw_teachers:
        if not isinstance(t, list) or len(t) != 4:
            raise RegError("O‘qituvchi ma’lumoti noto‘g‘ri")
        teachers.append({
            "name": _s(t[0], 3, 60, "O‘qituvchi ismi"),
            "subject": _s(t[1], 2, 40, "O‘qituvchi fani"),
            "experience": _int(t[2], 0, 60, "Tajriba", allow_none=True),
            "about": _s(t[3], 0, 120, "Izoh", required=False),
        })

    return {
        "tariff": tariff,
        "kind": kind,
        "name": _s(d.get("n"), 2, 80, "Nomi"),
        "phone": phone,
        "address": _s(d.get("a"), 3, 150, "Manzil"),
        "lat": float(lat),
        "lng": float(lng),
        "description": _s(d.get("d"), 0, 500, "Tavsif", required=False),
        "ageFrom": age_from,
        "ageTo": age_to,
        "amenities": amenities,
        "groups": groups,
        "teachers": teachers,
    }


# ---------------- Telegram Mini App initData tekshiruvi ----------------
import hashlib  # noqa: E402
import hmac  # noqa: E402
import time as _time  # noqa: E402
from datetime import datetime as _dt, timedelta as _td, timezone as _tz  # noqa: E402
from urllib.parse import parse_qsl as _parse_qsl  # noqa: E402


def validate_init_data(init_data: str, bot_token: str, max_age: int = 86400, now: float | None = None):
    """Telegram imzosini tekshiradi (core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
    To'g'ri bo'lsa user dict (id, first_name, ...), aks holda None."""
    if not init_data or len(init_data) > 4096:
        return None
    try:
        pairs = dict(_parse_qsl(init_data, keep_blank_values=True, strict_parsing=True))
    except ValueError:
        return None
    received = pairs.pop("hash", "")
    if not received:
        return None
    check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, received):
        return None
    try:
        auth_date = int(pairs.get("auth_date", "0"))
        user = json.loads(pairs.get("user", "null"))
    except ValueError:
        return None
    if (now if now is not None else _time.time()) - auth_date > max_age:
        return None
    if not isinstance(user, dict) or not isinstance(user.get("id"), int):
        return None
    return user


# ---------------- Sinov darsi vaqti ----------------
TASHKENT = _tz(_td(hours=5))
_WEEKDAY = {d: i for i, d in enumerate(DAY_ORDER)}  # Du=0 ... Ya=6


def next_lesson(days: list, time_range: str, now: _dt | None = None):
    """Guruhning keyingi dars boshlanishi (Toshkent vaqti) — ertadan boshlab 8 kun ichida. Topilmasa None."""
    m = re.match(r"(\d{1,2}):(\d{2})", time_range or "")
    wanted = {_WEEKDAY[d] for d in days or [] if d in _WEEKDAY}
    if not m or not wanted:
        return None
    now = (now or _dt.now(TASHKENT)).astimezone(TASHKENT)
    for i in range(1, 9):
        day = now + _td(days=i)
        if day.weekday() in wanted:
            return day.replace(hour=int(m.group(1)), minute=int(m.group(2)), second=0, microsecond=0)
    return None


# ---------------- AI yordamchi (Groq) ----------------
import math  # noqa: E402

AI_SYSTEM = (
    "Sen — YaqinDars ilovasining yordamchisisan. YaqinDars Rishton tumanida ota-onalar va o‘quvchilarga "
    "uyiga yaqin o‘quv markazlari, to‘garaklar va repetitorlarni topishga yordam beradi.\n\n"
    "QOIDALAR:\n"
    "1. Faqat shu mavzuda javob ber: farzand yoki o‘zi uchun kurs, o‘quv markazi, to‘garak yoki repetitor tanlash; "
    "fanlar, narx, dars kunlari va vaqti, masofa, bo‘sh joylar, o‘qituvchilar, bepul sinov darsi, ilovadan foydalanish. "
    "Boshqa mavzudagi savollarga (siyosat, din, kod yozish, uy vazifasini yechish, umumiy suhbat, tibbiy yoki huquqiy "
    "maslahat va h.k.) bir gap bilan xushmuomala rad et va nima bilan yordam bera olishingni ayt; bunda cards bo‘sh bo‘lsin.\n"
    "2. Markazlarni FAQAT quyidagi KATALOGdan tavsiya qil. Katalogda yo‘q markaz, narx, vaqt, telefon yoki manzilni "
    "hech qachon o‘ylab topma. Mos markaz bo‘lmasa — ochiq ayt va shartni yumshatishni (narx, kun, fan) taklif qil.\n"
    "3. Ko‘pi bilan 3 ta markaz tavsiya qil: avval bo‘sh joyi borlari, keyin yaqinroqlari. Har biri uchun tanlov sababini "
    "qisqa ayt (fan, narx, kun, masofa, bo‘sh joy).\n"
    "4. Javob o‘zbek tilida (lotin yozuvida), 1–4 qisqa gap, samimiy. Markdown, yulduzcha va ro‘yxat belgilarini ishlatma.\n"
    "5. Yozilish haqida so‘rashsa: markaz sahifasidagi «Bepul sinov darsi» tugmasini bosish kerakligini ayt.\n"
    "6. Shaxsiy ma’lumot (telefon, manzil, ism) so‘rama.\n"
    "7. Javobni FAQAT JSON ko‘rinishida qaytar: {\"text\": \"javob matni\", \"cards\": [\"markaz_id\", ...]} — "
    "cards ichida faqat KATALOGdagi id’lar (ko‘pi bilan 3 ta)."
)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = math.radians
    d = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(d))


def ai_catalog(centers: list, lat: float, lng: float, limit: int = 40) -> tuple[str, set]:
    """AI uchun ixcham katalog (eng yaqin `limit` ta). Qaytaradi: (matn, id'lar to'plami)."""
    rows = []
    for c in centers:
        try:
            km = haversine_km(lat, lng, float(c["lat"]), float(c["lng"]))
        except (KeyError, TypeError, ValueError):
            continue
        rows.append((km, c))
    rows.sort(key=lambda x: x[0])
    lines, ids = [], set()
    for km, c in rows[:limit]:
        cid = str(c.get("id", ""))
        if not cid:
            continue
        ids.add(cid)
        groups = "; ".join(
            f"{g.get('subject', '')} {','.join(g.get('days') or [])} {g.get('time', '')} "
            f"{int(g.get('price') or 0)} so‘m, bo‘sh joy {int(g.get('freeSeats') or 0)}"
            for g in (c.get("groups") or [])[:8]
        )
        age = f" | {c['ageFrom']}–{c['ageTo']} yosh" if c.get("ageFrom") and c.get("ageTo") else ""
        teachers = ", ".join(sorted({str(t.get("subject", "")) for t in (c.get("teachers") or []) if t.get("subject")}))
        lines.append(
            f"id={cid} | {str(c.get('name', ''))[:60]} | {'repetitor' if c.get('kind') == 'tutor' else 'markaz'} | "
            f"{km:.1f} km | {'VIP | ' if c.get('vip') else ''}"
            f"{('reyting ' + str(c['rating']) + ' | ') if c.get('rating') else ''}"
            f"{groups or 'guruh yo‘q'}{age}{(' | ustozlar: ' + teachers) if teachers else ''}"
        )
    return "\n".join(lines) or "(katalog bo‘sh)", ids


def parse_ai_reply(raw: str, valid_ids: set) -> dict | None:
    """AI javobidan {"text", "cards"} — katalogda yo'q id'lar tashlab yuboriladi. Yaroqsiz bo'lsa None."""
    if not raw:
        return None
    s = raw.strip()
    if not s.startswith("{"):
        a, b = s.find("{"), s.rfind("}")
        if a < 0 or b <= a:
            return None
        s = s[a : b + 1]
    try:
        d = json.loads(s)
    except ValueError:
        return None
    text = d.get("text") if isinstance(d, dict) else None
    if not isinstance(text, str) or not text.strip():
        return None
    cards = d.get("cards") if isinstance(d.get("cards"), list) else []
    seen, out = set(), []
    for c in cards:
        if isinstance(c, str) and c in valid_ids and c not in seen:
            seen.add(c)
            out.append(c)
    return {"text": text.strip()[:1200], "cards": out[:3]}


# ---------------- Firebase service account (bulut serverlari uchun) ----------------
SECRET_FILE_PATHS = ("/etc/secrets/serviceAccount.json", "/etc/secrets/service-account.json")


class CredError(Exception):
    pass


def load_service_account(raw_json: str, path: str, extra_paths=SECRET_FILE_PATHS) -> dict | str:
    """Firebase kaliti: dict (JSON matn) yoki fayl yo'li (str).
    Qabul qiladi: xom JSON; qo'shtirnoq ichidagi JSON; base64 JSON; o'zgaruvchiga yozilgan fayl yo'li;
    Render «Secret File» (/etc/secrets/serviceAccount.json); oddiy fayl (FIREBASE_CREDENTIALS).
    Xato xabarida kalitning o'zi ko'rsatilmaydi — faqat uzunligi va birinchi belgi turi."""
    import base64  # noqa: PLC0415
    import os  # noqa: PLC0415

    raw = (raw_json or "").strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "'\"":
        raw = raw[1:-1].strip()
    if raw:
        if raw.startswith("{"):
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as e:
                raise CredError(f"FIREBASE_CREDENTIALS_JSON — JSON buzilgan ({e.msg}, {e.pos}-belgi). "
                                "Faylning BUTUN matnini qayta nusxalang yoki Secret File sifatida yuklang.") from None
        elif os.path.isfile(raw):
            return raw
        else:
            try:
                data = json.loads(base64.b64decode(raw, validate=True))
            except Exception:  # noqa: BLE001
                first = "harf/raqam" if raw[:1].isalnum() else repr(raw[:1])
                raise CredError(
                    f"FIREBASE_CREDENTIALS_JSON — JSON emas (uzunligi {len(raw)}, boshlanishi: {first}; '{{' bo'lishi kerak). "
                    "serviceAccount.json faylini Bloknotda ochib, Ctrl+A, Ctrl+C bilan BUTUN matnini qo'ying — "
                    "yoki Render → Environment → Secret Files ga serviceAccount.json nomi bilan yuklang."
                ) from None
        if not isinstance(data, dict) or data.get("type") != "service_account" or "private_key" not in data:
            raise CredError("FIREBASE_CREDENTIALS_JSON — bu service account kaliti emas (type=service_account va private_key bo'lishi kerak).")
        return data
    for p in (path, *extra_paths):
        if p and os.path.isfile(p):
            return p
    raise CredError(f"Firebase kaliti topilmadi: {path}, FIREBASE_CREDENTIALS_JSON yoki Render Secret File (/etc/secrets/serviceAccount.json).")
