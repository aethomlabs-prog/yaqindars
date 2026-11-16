"""Barqarorlik: yagona nusxa qulfi, /health server, o'z-o'zini tekshirish, zaxira nusxa eksporti.

main.py dan chaqiriladi; db (firestore client) va bot parametr sifatida beriladi.
"""
from __future__ import annotations

import asyncio
import logging
import os
import platform
import time
import uuid
from datetime import datetime, timedelta, timezone

from aiohttp import web

from logic import SUB_KEY, build_backup_zip, split_bytes, to_jsonable

log = logging.getLogger("yaqindars.ops")

INSTANCE_ID = f"{platform.node()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"
LOCK_TTL = timedelta(seconds=90)  # yurak urishi shuncha vaqt kelmasa — qulf bo'sh hisoblanadi
HEARTBEAT_EVERY = 30  # soniya
HEALTH_STALE = 120  # soniya: oxirgi muvaffaqiyatli Telegram aloqasi shundan eski bo'lsa — 503

BACKUP_COLLECTIONS = ["centers", "applications", "users", "chats", "ratings"]
TG_FILE_LIMIT = 45 * 1024 * 1024  # Telegram bot 50 MB gacha fayl yuboradi — zaxira bilan


# ---------------- Holat (health va self-check uchun) ----------------
class State:
    role = "starting"  # starting | standby (boshqa nusxa ishlayapti) | active | stopping
    last_ok = 0.0  # oxirgi muvaffaqiyatli Telegram aloqasi (time.time)
    started = time.time()
    watcher_restarts = 0
    dead_watchers: set[str] = set()
    errors = 0  # ERROR darajadagi log yozuvlari (self-check oynasida nolga tushadi)


STATE = State()


class ErrorCounter(logging.Handler):
    def __init__(self):
        super().__init__(level=logging.ERROR)

    def emit(self, record):
        STATE.errors += 1


def health_status(now: float | None = None) -> tuple[int, str]:
    """(HTTP kod, matn). Kutish rejimida ham 200 — jarayon sog', faqat boshqa nusxa ishlayapti."""
    now = now or time.time()
    if STATE.role in ("starting", "standby"):
        return 200, STATE.role
    if STATE.role == "active" and now - STATE.last_ok <= HEALTH_STALE:
        return 200, "ok"
    return 503, f"{STATE.role}: oxirgi aloqa {int(now - STATE.last_ok)} s oldin"


async def start_health_server() -> web.AppRunner | None:
    async def health(_req):
        code, text = health_status()
        return web.Response(status=code, text=text)

    app = web.Application()
    app.router.add_get("/health", health)
    app.router.add_get("/", health)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    port = int(os.getenv("PORT", "8080"))
    try:
        await web.TCPSite(runner, "0.0.0.0", port).start()
        log.info("Health server: http://0.0.0.0:%s/health", port)
        return runner
    except OSError as e:
        log.warning("Health server ishga tushmadi (port %s band?): %s", port, e)
        await runner.cleanup()
        return None


# ---------------- Yagona nusxa qulfi: system/botLock ----------------
def lock_free_for(data: dict | None, instance_id: str, now: datetime) -> bool:
    """Qulfni olish mumkinmi: yo'q, o'zimniki yoki yurak urishi eskirgan."""
    if not data:
        return True
    if data.get("instanceId") == instance_id:
        return True
    hb = data.get("heartbeat")
    return not isinstance(hb, datetime) or now - hb > LOCK_TTL


def _lock_txn(transaction, ref, instance_id: str) -> bool:
    from google.cloud import firestore as gfs  # noqa: PLC0415

    snap = ref.get(transaction=transaction)
    cur = (snap.to_dict() or {}) if snap.exists else None
    now = datetime.now(timezone.utc)
    if not lock_free_for(cur, instance_id, now):
        return False
    since = cur.get("since", now) if cur and cur.get("instanceId") == instance_id else now
    transaction.set(ref, {"instanceId": instance_id, "host": platform.node(), "heartbeat": now,
                          "since": since, "updatedAt": gfs.SERVER_TIMESTAMP})
    return True


def try_lock(db) -> bool:
    from google.cloud import firestore as gfs  # noqa: PLC0415

    ref = db.collection("system").document("botLock")
    return gfs.transactional(_lock_txn)(db.transaction(), ref, INSTANCE_ID)


def lock_holder(db) -> dict:
    snap = db.collection("system").document("botLock").get()
    return snap.to_dict() or {} if snap.exists else {}


async def acquire_lock(db):
    """Qulf bo'shaguncha kutadi (boshqa nusxa ishlayotgan bo'lsa — polling boshlanmaydi)."""
    warned = False
    while True:
        try:
            if await asyncio.to_thread(try_lock, db):
                STATE.role = "active"
                log.info("Yagona nusxa qulfi olindi: %s", INSTANCE_ID)
                return
            STATE.role = "standby"
            if not warned:
                holder = await asyncio.to_thread(lock_holder, db)
                log.warning("Boshqa nusxa ishlayapti (%s) — u to'xtashini kutyapman. Ikkala bot birga ishlamaydi.",
                            holder.get("host", "?"))
                warned = True
        except Exception as e:  # noqa: BLE001
            log.warning("Qulfni tekshirib bo'lmadi: %s", e)
        await asyncio.sleep(HEARTBEAT_EVERY)


def release_lock(db):
    ref = db.collection("system").document("botLock")
    try:
        snap = ref.get()
        if snap.exists and (snap.to_dict() or {}).get("instanceId") == INSTANCE_ID:
            ref.delete()
    except Exception as e:  # noqa: BLE001
        log.info("Qulfni bo'shatib bo'lmadi: %s", e)


async def heartbeat_loop(db, bot, on_lost):
    """Har 30 s: Telegram bilan aloqa (health uchun) + qulfni yangilash. Qulf boshqaga o'tsa — on_lost()."""
    while True:
        try:
            await bot.get_me()
            STATE.last_ok = time.time()
        except Exception as e:  # noqa: BLE001
            log.warning("Telegram bilan aloqa yo'q: %s", e)
        try:
            if not await asyncio.to_thread(try_lock, db):
                log.error("Qulf boshqa nusxaga o'tdi — bu nusxa to'xtaydi")
                STATE.role = "stopping"
                await on_lost()
                return
        except Exception as e:  # noqa: BLE001
            log.warning("Qulfni yangilab bo'lmadi: %s", e)
        await asyncio.sleep(HEARTBEAT_EVERY)


# ---------------- O'z-o'zini tekshirish (har 10 daqiqa) ----------------
SELF_CHECK_EVERY = 10 * 60
ERRORS_ALERT = 10  # 10 daqiqada shuncha xato — ogohlantirish
ALERT_REPEAT = timedelta(hours=1)  # bir xil ogohlantirish soatiga bir marta


def self_check_problems(dead: set[str], restarts: int, errors: int, since_ok: float) -> list[str]:
    out = []
    if dead:
        out.append("To‘xtagan kuzatuvchilar: " + ", ".join(sorted(dead)))
    if restarts >= 3:
        out.append(f"Kuzatuvchilar 10 daqiqada {restarts} marta qayta ishga tushdi (internet beqaror?)")
    if errors >= ERRORS_ALERT:
        out.append(f"10 daqiqada {errors} ta xato — /logs ni ko‘ring")
    if since_ok > HEALTH_STALE:
        out.append(f"Telegram bilan aloqa {int(since_ok)} s dan beri yo‘q")
    return out


async def self_check_loop(notify_admins):
    last_sent: dict[str, datetime] = {}
    while True:
        await asyncio.sleep(SELF_CHECK_EVERY)
        try:
            problems = self_check_problems(set(STATE.dead_watchers), STATE.watcher_restarts, STATE.errors,
                                           time.time() - STATE.last_ok)
            STATE.watcher_restarts = 0
            STATE.errors = 0
            now = datetime.now(timezone.utc)
            fresh = [p for p in problems if now - last_sent.get(p.split(":")[0], now - 2 * ALERT_REPEAT) > ALERT_REPEAT]
            if fresh:
                for p in fresh:
                    last_sent[p.split(":")[0]] = now
                await notify_admins("⚠️ <b>Bot o‘z-o‘zini tekshirdi</b>\n\n" + "\n".join(f"• {p}" for p in fresh))
        except Exception:  # noqa: BLE001
            log.exception("Self-check xatosi")


# ---------------- Zaxira nusxa ----------------
def export_docs(col_ref) -> list[dict]:
    """Kolleksiya hujjatlari + ichki kolleksiyalari (rekursiv)."""
    out = []
    for snap in col_ref.stream():
        item = {"id": snap.id, "data": to_jsonable(snap.to_dict() or {})}
        subs = {}
        for sub in snap.reference.collections():
            subs[sub.id] = export_docs(sub)
        if subs:
            item[SUB_KEY] = subs
        out.append(item)
    return out


def export_all(db) -> dict[str, list[dict]]:
    return {name: export_docs(db.collection(name)) for name in BACKUP_COLLECTIONS}


def make_backup(db, now: datetime | None = None) -> tuple[bytes, dict[str, int]]:
    now = now or datetime.now(timezone.utc)
    cols = export_all(db)
    return build_backup_zip(cols, now), {k: len(v) for k, v in cols.items()}


async def send_backup(db, bot, chat_ids, reason: str = "kunlik") -> str:
    from aiogram.types import BufferedInputFile  # noqa: PLC0415

    from logic import TASHKENT  # noqa: PLC0415

    now = datetime.now(timezone.utc)
    data, counts = await asyncio.to_thread(make_backup, db, now)
    stamp = now.astimezone(TASHKENT).strftime("%Y-%m-%d_%H%M")
    parts = split_bytes(data, TG_FILE_LIMIT)
    summary = ", ".join(f"{k}: {v}" for k, v in counts.items())
    size_kb = len(data) / 1024
    caption = f"💾 Zaxira nusxa ({reason}) · {stamp}\n{summary}\nHajm: {size_kb:,.0f} KB".replace(",", " ")
    for chat in chat_ids:
        for i, part in enumerate(parts, 1):
            name = f"yaqindars_{stamp}.zip" if len(parts) == 1 else f"yaqindars_{stamp}.zip.part{i}"
            cap = caption if i == 1 else f"{i}-qism / {len(parts)}"
            if len(parts) > 1 and i == 1:
                cap += f"\n{len(parts)} qismga bo‘lingan: birlashtirish — restore.py hammasini oladi"
            await bot.send_document(chat, BufferedInputFile(part, filename=name), caption=cap)
    log.info("Zaxira nusxa yuborildi (%s): %s, %.0f KB", reason, summary, size_kb)
    return summary
