"""Sof mantiq (Firestore/Telegram'siz) — testlash oson: zaxira nusxa, obuna, kuzatuvlar, baholar, kodlar, narxlar."""
from __future__ import annotations

import io
import json
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
