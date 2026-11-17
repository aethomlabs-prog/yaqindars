"""Sof mantiq (Firestore/Telegram'siz) — testlash oson: zaxira nusxa, obuna, kuzatuvlar, baholar, kodlar, narxlar."""
from __future__ import annotations

import io
import json
import secrets
import zipfile
from datetime import datetime, timedelta, timezone

TASHKENT = timezone(timedelta(hours=5))
DAY = timedelta(days=1)

# ---------------- Zaxira nusxa ----------------
TS_KEY = "__ts__"
SUB_KEY = "__sub__"


def to_jsonable(v):
    """Firestore qiymatini JSON'ga: vaqt -> {"__ts__": ISO}, ichma-ich ro'yxat/lug'atlar ham."""
    if isinstance(v, datetime):
        return {TS_KEY: v.astimezone(timezone.utc).isoformat()}
    if isinstance(v, dict):
        return {str(k): to_jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [to_jsonable(x) for x in v]
    if isinstance(v, (str, int, float, bool)) or v is None:
        return v
    return str(v)  # GeoPoint, DocumentReference va h.k. — matn sifatida


def from_jsonable(v):
    """to_jsonable ning teskarisi (tiklash uchun)."""
    if isinstance(v, dict):
        if set(v) == {TS_KEY}:
            return datetime.fromisoformat(v[TS_KEY])
        return {k: from_jsonable(x) for k, x in v.items()}
    if isinstance(v, list):
        return [from_jsonable(x) for x in v]
    return v


def build_backup_zip(collections: dict[str, list[dict]], created: datetime) -> bytes:
    """{kolleksiya: [hujjatlar]} -> zip (har kolleksiya alohida JSON) + manifest."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        manifest = {"created": created.astimezone(timezone.utc).isoformat(), "counts": {k: len(v) for k, v in collections.items()}}
        z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=1))
        for name, docs in collections.items():
            z.writestr(f"{name}.json", json.dumps(docs, ensure_ascii=False))
    return buf.getvalue()


def split_bytes(data: bytes, max_part: int) -> list[bytes]:
    """Telegram fayl chegarasi uchun bo'laklarga ajratish (birlashtirish: part1+part2+...)."""
    if max_part <= 0:
        raise ValueError("max_part > 0 bo'lsin")
    return [data[i : i + max_part] for i in range(0, len(data), max_part)] or [b""]


def read_backup_zip(data: bytes) -> tuple[dict, dict[str, list[dict]]]:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        manifest = json.loads(z.read("manifest.json"))
        cols = {n[:-5]: json.loads(z.read(n)) for n in z.namelist() if n.endswith(".json") and n != "manifest.json"}
    return manifest, cols


# ---------------- Rejalashtirish (Toshkent vaqti) ----------------
def due_daily(now: datetime, hour: int, minute: int, last_run_date: str | None) -> bool:
    """Bugungi hour:minute o'tgan va bugun hali bajarilmagan bo'lsa True."""
    local = now.astimezone(TASHKENT)
    return local.strftime("%Y-%m-%d") != last_run_date and (local.hour, local.minute) >= (hour, minute)


def due_weekly(now: datetime, weekday: int, hour: int, minute: int, last_run_date: str | None) -> bool:
    """weekday: 0 = dushanba."""
    local = now.astimezone(TASHKENT)
    return local.weekday() == weekday and due_daily(now, hour, minute, last_run_date)


def local_date(now: datetime) -> str:
    return now.astimezone(TASHKENT).strftime("%Y-%m-%d")


# ---------------- Markazni egallash (claim) kodlari ----------------
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 0/O, 1/I chalkashmasin
CODE_LEN = 6
CODE_TTL = timedelta(days=7)


def make_claim_code(rng=None) -> str:
    pick = (rng or secrets).choice
    return "".join(pick(CODE_ALPHABET) for _ in range(CODE_LEN))


def normalize_code(text: str) -> str:
    return "".join(ch for ch in (text or "").upper() if ch.isalnum())[:CODE_LEN * 2]


def claim_code_error(code_doc: dict | None, center: dict | None, now: datetime) -> str | None:
    """Kodni ishlatib bo'lmasa — sababi (o'zbekcha), bo'lsa None."""
    if not code_doc:
        return "Kod topilmadi. Harflarni tekshiring."
    if code_doc.get("usedBy"):
        return "Bu kod allaqachon ishlatilgan."
    exp = code_doc.get("expiresAt")
    if isinstance(exp, datetime) and now > exp:
        return "Kodning muddati tugagan. Admindan yangisini so‘rang."
    if not center:
        return "Markaz topilmadi (o‘chirilgan bo‘lishi mumkin)."
    if is_claimed(center):
        return "Bu markazning egasi allaqachon bor."
    return None


def is_claimed(center: dict) -> bool:
    """Eski markazlarda claimed maydoni yo'q — egasi bo'lsa egallangan hisoblanadi."""
    if "claimed" in center:
        return center.get("claimed") is True
    return bool(center.get("ownerTgId"))


# ---------------- Obuna (to'lov) muddati ----------------
TRIAL = timedelta(days=15)  # bepul sinov davri
REMIND_DAYS = (3, 1)
HIDE_AFTER = timedelta(days=7)


def billing_until(center: dict) -> datetime | None:
    """Sinov (egallangan/yaratilgan sanadan 15 kun) yoki to'langan muddat — qaysi biri keyin bo'lsa."""
    start = center.get("claimedAt") or center.get("createdAt")
    trial_end = start + TRIAL if isinstance(start, datetime) else None
    paid = center.get("paidUntil") if isinstance(center.get("paidUntil"), datetime) else None
    cands = [d for d in (trial_end, paid) if d]
    return max(cands) if cands else None


def billing_action(center: dict, now: datetime) -> tuple[str, int] | None:
    """Kunlik tekshiruv: ("remind", 3|1) | ("hide", o'tgan_kun) | ("unhide", 0) | None.
    Faqat egasi bor va tasdiqlangan markazlar uchun. Bir xil eslatma bitta muddat uchun bir marta."""
    if not center.get("approved") or not center.get("ownerTgId") or not is_claimed(center):
        return None
    until = billing_until(center)
    if not until:
        return None
    if center.get("hidden") is True:
        return ("unhide", 0) if until > now else None
    left = until - now
    if left > timedelta(0):
        days = -(-left // DAY)  # qolgan kunlar, yuqoriga yaxlitlangan (2 kun 3 soat -> 3)
        for d in REMIND_DAYS:
            if days == d and center.get("billingReminded") != f"{until.date().isoformat()}:{d}":
                return ("remind", d)
        return None
    if now - until > HIDE_AFTER:
        return ("hide", (now - until).days)
    return None


def remind_key(center: dict, days: int) -> str:
    return f"{billing_until(center).date().isoformat()}:{days}"


# ---------------- Haftalik hisobot ----------------
STAT_KEYS = ("views", "calls", "routes", "apps", "accepted")


def sum_stats(docs: list[dict]) -> dict[str, int]:
    out = {k: 0 for k in STAT_KEYS}
    for d in docs:
        for k in STAT_KEYS:
            v = d.get(k)
            if isinstance(v, (int, float)):
                out[k] += int(v)
    return out


def week_dates(now: datetime, weeks_back: int = 0) -> list[str]:
    """Oxirgi 7 kun (bugunsiz), weeks_back=1 — undan oldingi 7 kun. Toshkent sanalari."""
    today = now.astimezone(TASHKENT).date()
    end = today - timedelta(days=7 * weeks_back)
    return [(end - timedelta(days=i)).isoformat() for i in range(7, 0, -1)]


def fmt_change(cur: int, prev: int) -> str:
    if prev == 0:
        return "yangi" if cur else "—"
    pct = round((cur - prev) * 100 / prev)
    return f"{'+' if pct > 0 else ''}{pct}%" if pct else "o‘zgarmadi"


def weekly_tip(cur: dict[str, int], center: dict, now: datetime) -> str:
    groups = center.get("groups") or []
    upd = center.get("updatedAt")
    if isinstance(upd, datetime) and now - upd > timedelta(days=10):
        return "Bo‘sh joylar va narxlarni yangilang — yangi ma’lumotli markazlar ro‘yxatda yuqoriroq ko‘rinadi."
    if groups and not any((g.get("freeSeats") or 0) > 0 for g in groups):
        return "Hamma guruhda bo‘sh joy 0 — ota-onalar ariza qoldira olmaydi. Hech bo‘lmasa bitta guruhga joy qo‘shing."
    if cur["views"] >= 10 and cur["apps"] == 0:
        return "Ko‘rishlar bor, ariza yo‘q: narx va dars vaqtlarini qayta ko‘rib chiqing yoki tavsifga sinov darsi haqida yozing."
    if cur["apps"] and cur["accepted"] < cur["apps"]:
        return "Arizalarga tezroq javob bering — 1 soat ichida javob berilgan arizalar ko‘proq qabulga aylanadi."
    if cur["views"] < 10:
        return "QR kodingizni («📲 Mening QR’im») markaz eshigiga va ijtimoiy tarmoqlarga joylang — ko‘rishlar oshadi."
    return "Yaxshi natija! Guruh vaqtlarini dolzarb tutib turing."


# ---------------- Admin tez qo'shish: matndan koordinata ----------------
_NUM = r"(-?\d{1,3}\.\d{3,})"


def parse_latlng(text: str) -> tuple[float, float] | None:
    """«40.35, 71.28», Google Maps havolasi (@40.35,71.28 / q=40.35,71.28) yoki Yandex (ll=71.28,40.35)."""
    import re  # noqa: PLC0415

    t = (text or "").strip()
    m = re.search(r"[?&]ll=" + _NUM + r"(?:,|%2C)" + _NUM, t)  # Yandex: avval uzunlik
    if m:
        lat, lng = float(m.group(2)), float(m.group(1))
    else:
        m = re.search(_NUM + r"\s*(?:,|%2C|\s)\s*" + _NUM, t)
        if not m:
            return None
        lat, lng = float(m.group(1)), float(m.group(2))
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def parse_subjects(text: str, known: list[str]) -> list[str]:
    """«ingliz tili, matematika» -> ["Ingliz tili", "Matematika"]; «-» -> []."""
    t = (text or "").strip()
    if t in ("", "-", "—", "yo‘q", "yo'q"):
        return []
    by_lower = {k.lower(): k for k in known}
    out: list[str] = []
    for part in t.replace(";", ",").split(","):
        p = " ".join(part.split())[:40]
        if not p:
            continue
        name = by_lower.get(p.lower()) or next((k for k in known if k.lower().startswith(p.lower()[:4])), None) or p[:1].upper() + p[1:]
        if name not in out:
            out.append(name)
    return out[:10]


# ---------------- Kampaniya havolalari ----------------
CAMPAIGNS = ("flyer", "maktab", "stiker", "instagram", "youtube")


def campaign_slug(text: str) -> str | None:
    import re  # noqa: PLC0415

    s = (text or "").strip().lower()
    return s if re.fullmatch(r"[a-z0-9_]{2,30}", s) else None


# ---------------- Saqlangan qidiruv («Shunday joy ochilsa xabar ber») ----------------
WATCH_DAILY_LIMIT = 3  # bitta foydalanuvchiga kuniga ko'pi bilan
WATCH_SENT_KEEP = 60  # bitta kuzatuvda eslab qolinadigan yuborilgan guruhlar soni


def _km(a_lat, a_lng, b_lat, b_lng) -> float:
    import math  # noqa: PLC0415

    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def watch_matches(w: dict, center: dict, group: dict) -> bool:
    """Kuzatuv shartlari: fan, radius (kuzatuv saqlangan joydan), eng yuqori narx, kunlar. Bo'sh joy > 0."""
    if (group.get("freeSeats") or 0) <= 0:
        return False
    subj = w.get("subject")
    if subj and str(group.get("subject", "")).lower() != str(subj).lower():
        return False
    max_price = w.get("maxPrice")
    price = group.get("price") or 0
    if max_price and (price <= 0 or price > max_price):
        return False
    days = w.get("days") or []
    if days and (not group.get("days") or not set(group["days"]) <= set(days)):
        return False
    radius = w.get("radiusKm")
    if radius:
        try:
            if _km(float(w["lat"]), float(w["lng"]), float(center["lat"]), float(center["lng"])) > float(radius):
                return False
        except (KeyError, TypeError, ValueError):
            return False
    return True


def watch_key(cid: str, gi: int) -> str:
    return f"{cid}:{gi}"


def watch_should_send(w: dict, key: str, sent_today: int) -> bool:
    """Takrorlanmasin (shu guruh uchun allaqachon yuborilgan bo'lsa — yo'q) va kuniga 3 tadan oshmasin."""
    return key not in (w.get("sent") or []) and sent_today < WATCH_DAILY_LIMIT


def watch_title(w: dict) -> str:
    parts = [w.get("subject") or "Istalgan fan"]
    if w.get("radiusKm"):
        parts.append(f"{w['radiusKm']:g} km gacha")
    if w.get("maxPrice"):
        parts.append(f"{int(w['maxPrice']) // 1000} ming so‘mgacha")
    if w.get("days"):
        parts.append(", ".join(w["days"]))
    return " · ".join(parts)


# ---------------- Sinov darsidan keyin baho ----------------
RATE_AFTER = timedelta(hours=3)
RATE_WINDOW = timedelta(days=3)  # juda eski darslar uchun so'ramaymiz
RATING_MIN_COUNT = 3


def rating_due(app: dict, now: datetime) -> bool:
    t = app.get("trialAt")
    if app.get("status") != "accepted" or app.get("ratingAsked") or app.get("rated") or not isinstance(t, datetime):
        return False
    return t + RATE_AFTER <= now <= t + RATE_AFTER + RATE_WINDOW


def rating_error(app: dict | None, user_id: int, existing: bool) -> str | None:
    """Faqat qabul qilingan ariza egasi va faqat bir marta baholay oladi."""
    if not app:
        return "Ariza topilmadi."
    if app.get("tgUserId") != user_id:
        return "Faqat ariza egasi baholay oladi."
    if app.get("status") != "accepted":
        return "Faqat qabul qilingan sinov darsini baholash mumkin."
    if existing or app.get("rated"):
        return "Siz bu darsni allaqachon baholagansiz. Rahmat!"
    return None


def display_rating(rating_sum, rating_count) -> float | None:
    """Kamida 3 ta baho bo'lsa — o'rtacha (1 xona), aks holda None («Yangi»)."""
    try:
        n = int(rating_count or 0)
        if n < RATING_MIN_COUNT:
            return None
        return round(float(rating_sum) / n, 1)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


# ---------------- Inline rejim: @yaqindars_bot ingliz ----------------
def norm_text(s: str) -> str:
    s = (s or "").lower()
    for ch in "‘’ʻʼ`´'":
        s = s.replace(ch, "")
    return " ".join(s.split())


def inline_search(centers: list[dict], query: str, limit: int = 20) -> list[dict]:
    """centers: [{"id", "name", "groups", "vip", ...}] (tasdiqlangan, yashirilmagan).
    «c_<id>» — aniq markaz; bo'sh so'rov — bo'sh joyi borlar; aks holda nom yoki fan bo'yicha."""
    q = (query or "").strip()
    if q.startswith("c_"):
        return [c for c in centers if c.get("id") == q[2:]][:1]
    nq = norm_text(q)

    def free(c):
        return sum(int(g.get("freeSeats") or 0) for g in c.get("groups") or [])

    def hit(c):
        if not nq:
            return free(c) > 0
        hay = norm_text(c.get("name", "")) + " " + " ".join(norm_text(g.get("subject", "")) for g in c.get("groups") or [])
        return all(word in hay for word in nq.split())

    found = [c for c in centers if hit(c)]
    found.sort(key=lambda c: (not c.get("vip"), free(c) == 0, norm_text(c.get("name", ""))))
    return found[:limit]
