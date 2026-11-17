"""YaqinDars Telegram bot (aiogram 3, polling).

- Ota-onalar uchun: /start -> "Xaritani ochish" (Telegram Mini App)
- Markazlar uchun: /markaz -> ro'yxatdan o'tish, guruhlar, bo'sh joy va narxni yangilash
- Mini App'dan kelgan arizalarni markaz egasiga yuboradi
- Ma'lumot 7 kundan beri yangilanmasa, markazga eslatma yuboradi
- Admin: tasdiqlash / rad etish, /vip, /stat
"""
import asyncio
import json
import ssl
import logging
import logging.handlers
import platform
import queue
import time
import traceback
import os
import sys
from datetime import datetime, timedelta, timezone
from html import escape
from urllib.parse import parse_qsl, quote, urlencode, urljoin, urlsplit, urlunsplit

from dotenv import load_dotenv

load_dotenv()


def _env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default or "").strip()
    if not value:
        sys.exit(f"XATO: .env faylida {name} ko‘rsatilmagan. bot/.env.example ga qarang.")
    return value


BOT_TOKEN = _env("BOT_TOKEN")
WEBAPP_URL = _env("WEBAPP_URL")
CRED_PATH = _env("FIREBASE_CREDENTIALS", "serviceAccount.json")
try:
    ADMIN_IDS = {int(x) for x in os.getenv("ADMIN_IDS", "").replace(" ", "").split(",") if x}
except ValueError:
    sys.exit("XATO: ADMIN_IDS faqat raqamlardan iborat bo‘lsin (vergul bilan), masalan: 123456789,987654321")
if not WEBAPP_URL.startswith("https://"):
    sys.exit("XATO: WEBAPP_URL https:// bilan boshlanishi kerak (Telegram faqat HTTPS Mini App’ni ochadi).")
# Bulutda (Railway/Render) fayl o'rniga butun JSON'ni FIREBASE_CREDENTIALS_JSON o'zgaruvchisiga qo'yish mumkin
CRED_JSON = os.getenv("FIREBASE_CREDENTIALS_JSON", "").strip()
if not CRED_JSON and not os.path.isfile(CRED_PATH):
    sys.exit(f"XATO: Firebase service account topilmadi: {CRED_PATH} (yoki FIREBASE_CREDENTIALS_JSON ni bering)")

def _with_param(url: str, key: str, value: str) -> str:
    parts = urlsplit(url)
    q = dict(parse_qsl(parts.query))
    q[key] = value
    return urlunsplit(parts._replace(query=urlencode(q)))


# Markazni ro'yxatdan o'tkazish Mini App'i (o'sha web app, ?mode=register)
REGISTER_URL = _with_param(WEBAPP_URL, "mode", "register")
# Ilovani TELEGRAM'SIZ (brauzer orqali haqiqiy ilova — PWA) o'rnatish sahifasi; URL tugma bilan brauzerda ochiladi
INSTALL_URL = _with_param(WEBAPP_URL, "install", "1")
OWNER_URL = _with_param(WEBAPP_URL, "mode", "owner")  # ta'lim beruvchi kabineti
ADMIN_URL = _with_param(WEBAPP_URL, "mode", "admin")  # admin dashboard
PRIVACY_URL = urljoin(WEBAPP_URL.split("?")[0], "privacy")  # webapp/public/privacy.html

# AI yordamchi (Groq, ixtiyoriy). Kalit bo'lmasa — ilovada oddiy qidiruv ishlaydi.
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b").strip()
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
AI_PER_HOUR = 20  # bitta foydalanuvchi soatiga nechta savol bera oladi

def _trust_system_certs():
    """Windows'da antivirus (masalan Avast) yoki korporativ proxy HTTPS'ni o'z sertifikati bilan tekshiradi.
    Python (certifi) va gRPC (Firestore) bu sertifikatni tanimaydi -> CERTIFICATE_VERIFY_FAILED.
    Yechim: Windows sertifikat ombori + certifi'ni bitta faylga yig'ib, gRPC va requests'ga beramiz.
    Linux/Docker (Railway, Render) — tegmaymiz."""
    if os.name != "nt" or os.getenv("GRPC_DEFAULT_SSL_ROOTS_FILE_PATH"):
        return
    try:
        import ssl as _ssl
        import tempfile

        import certifi as _certifi

        pems = [open(_certifi.where(), encoding="utf-8").read()]
        for store in ("ROOT", "CA"):
            for der, enc, _trust in _ssl.enum_certificates(store):
                if enc == "x509_asn":
                    pems.append(_ssl.DER_cert_to_PEM_cert(der))
        path = os.path.join(tempfile.gettempdir(), "yaqindars-ca-bundle.pem")
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(pems))
        os.environ["GRPC_DEFAULT_SSL_ROOTS_FILE_PATH"] = path
        os.environ.setdefault("REQUESTS_CA_BUNDLE", path)
        os.environ.setdefault("SSL_CERT_FILE", path)
    except Exception as e:  # noqa: BLE001
        print(f"Ogohlantirish: tizim sertifikatlarini yig'ib bo'lmadi: {e}")


_trust_system_certs()

import aiohttp  # noqa: E402
import firebase_admin  # noqa: E402
from aiogram import Bot, Dispatcher, F, Router  # noqa: E402
import certifi  # noqa: E402
from aiogram.client.default import DefaultBotProperties  # noqa: E402
from aiogram.client.session.aiohttp import AiohttpSession  # noqa: E402
from aiogram.enums import ParseMode  # noqa: E402
from aiogram.exceptions import TelegramBadRequest, TelegramNetworkError  # noqa: E402
from aiogram.filters import Command, CommandObject, CommandStart, StateFilter  # noqa: E402
from aiogram.fsm.context import FSMContext  # noqa: E402
from aiogram.fsm.state import State, StatesGroup  # noqa: E402
from aiogram.types import (  # noqa: E402
    BotCommand,
    BufferedInputFile,
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
    BotCommandScopeChat,
    ErrorEvent,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    MenuButtonWebApp,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)
from firebase_admin import auth as fb_auth, credentials, firestore  # noqa: E402
from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: E402

import ops  # noqa: E402
import re  # noqa: E402

SOURCE_RE = re.compile(r"(src_[a-z0-9_]{2,30}|c_[A-Za-z0-9]{1,40})")
from google.api_core.exceptions import AlreadyExists  # noqa: E402
from logic import (  # noqa: E402
    CAMPAIGNS,
    WATCH_SENT_KEEP,
    billing_action,
    display_rating,
    inline_search,
    rating_due,
    rating_error,
    watch_key,
    watch_matches,
    watch_should_send,
    watch_title,
    campaign_slug,
    claim_code_error,
    due_daily,
    due_weekly,
    fmt_change,
    is_claimed,
    local_date,
    make_claim_code,
    normalize_code,
    parse_latlng,
    parse_subjects,
    remind_key,
    sum_stats,
    week_dates,
    weekly_tip,
    CODE_TTL,
)
from poster import make_poster  # noqa: E402
from parsers import (  # noqa: E402
    TARIFF_PRICES,
    TRIAL_DAYS,
    tariff_price,
    AI_SYSTEM,
    TASHKENT,
    RegError,
    ai_catalog,
    next_lesson,
    normalize_phone,
    parse_days,
    parse_int,
    parse_registration,
    parse_ai_reply,
    parse_time,
    validate_init_data,
)

firebase_admin.initialize_app(credentials.Certificate(json.loads(CRED_JSON) if CRED_JSON else CRED_PATH))
db = firestore.client()
CENTERS = db.collection("centers")
APPS = db.collection("applications")
CHATS = db.collection("chats")
WAITLIST = db.collection("waitlist")
LINKS = db.collection("tgLinks")  # Mini App -> Telegram tasdiqlash so'rovlari
USERS = db.collection("users")
DELETE_REQS = db.collection("deleteRequests")
AI_REQS = db.collection("aiRequests")  # ilovadagi AI yordamchi savollari  # ilovadagi «Ma’lumotlarimni o‘chirish»

SUBJECTS = ["Ingliz tili", "Matematika", "IT", "Rus tili", "Kimyo", "Biologiya", "Fizika", "Ona tili", "Sport", "Boshqa"]
PRICE_MIN, PRICE_MAX = 10_000, 10_000_000
SEATS_MAX = 100
REMIND_AFTER = timedelta(days=7)
REMIND_CHECK_EVERY = 60 * 60  # soniya (sinov darsi eslatmalari uchun soatbay)
# Maxfiylik siyosati: arizalar 12 oy, texnik xato yozuvlari 90 kun saqlanadi
APPS_RETENTION = timedelta(days=365)
LOGS_RETENTION = timedelta(days=90)
CLEANUP_EVERY = 24 * 60 * 60  # soniya

# FSM holatlarida buyruqlar (/...) matn sifatida qabul qilinmasin
TEXT = F.text & ~F.text.startswith("/")

router = Router()
log = logging.getLogger("yaqindars")


# ---------------- States ----------------
class Reg(StatesGroup):
    name = State()
    address = State()
    location = State()
    phone = State()
    amenities = State()


class AddGroup(StatesGroup):
    subject = State()
    subject_text = State()
    days = State()
    time = State()
    price = State()
    seats = State()


class EditPrice(StatesGroup):
    price = State()


class Reply(StatesGroup):
    text = State()


class Support(StatesGroup):
    ask = State()  # foydalanuvchi adminga savol yozmoqda
    answer = State()  # admin javob yozmoqda


# ---------------- Helpers ----------------
def btn(text: str, *parts) -> InlineKeyboardButton:
    data = ":".join(str(p) for p in parts)
    if len(data.encode()) > 64:  # Telegram cheklovi
        raise ValueError(f"callback_data juda uzun: {data}")
    return InlineKeyboardButton(text=text, callback_data=data)


def fmt_sum(n) -> str:
    return f"{int(n):,}".replace(",", " ") + " so‘m"


def as_dict(snap) -> dict:
    return (snap.to_dict() or {}) if snap is not None else {}


async def get_center(cid: str):
    if not cid or "/" in cid:
        return None
    snap = await asyncio.to_thread(CENTERS.document(cid).get)
    return snap if snap.exists else None


async def owner_centers(uid: int):
    q = CENTERS.where(filter=FieldFilter("ownerTgId", "==", uid))
    return await asyncio.to_thread(lambda: list(q.stream()))


@firestore.transactional
def _groups_txn(transaction, ref, uid, change):
    snap = ref.get(transaction=transaction)
    data = as_dict(snap) if snap.exists else None
    if data is None or data.get("ownerTgId") != uid:
        return None
    groups = list(data.get("groups") or [])
    if change(groups) is False:
        return data
    transaction.update(ref, {"groups": groups, "updatedAt": firestore.SERVER_TIMESTAMP})
    data["groups"] = groups
    return data


async def update_groups(cid: str, uid: int, change):
    """Guruhlarni tranzaksiya ichida o'zgartiradi. Egasi bo'lmasa None qaytaradi."""
    ref = CENTERS.document(cid)
    return await asyncio.to_thread(lambda: _groups_txn(db.transaction(), ref, uid, change))


def panel(cid: str, data: dict):
    groups = data.get("groups") or []
    status = "✅ Tasdiqlangan — xaritada ko‘rinadi" if data.get("approved") else "⏳ Admin tasdiqlashini kutmoqda"
    vip = " · ⭐ VIP" if data.get("vip") else ""
    tariff = data.get("tariff")
    lines = [f"🏫 <b>{escape(data.get('name', ''))}</b>{vip}", f"Holat: {status}"]
    if tariff in TARIFF_PRICES:
        lines.append(f"Tarif: {'VIP' if tariff == 'vip' else 'Oddiy'} — {fmt_sum(tariff_price(data.get('kind'), tariff))}/oy")
    if data.get("teachers"):
        lines.append(f"O‘qituvchilar: {len(data['teachers'])} ta")
    lines.append("")
    if not groups:
        lines.append("Hali guruh qo‘shilmagan. «➕ Guruh qo‘shish» tugmasini bosing.")
    for i, g in enumerate(groups, 1):
        lines.append(
            f"{i}. <b>{escape(str(g.get('subject', '')))}</b> · {escape(', '.join(g.get('days', [])))} · "
            f"{escape(str(g.get('time', '')))}\n"
            f"     {fmt_sum(g.get('price', 0))} · bo‘sh joy: <b>{int(g.get('freeSeats', 0))}</b>"
        )
    if groups:
        lines.append("\n➖ / ➕ — bo‘sh joy sonini o‘zgartirish. O‘zgarish xaritada darhol ko‘rinadi.")

    kb = []
    for i, g in enumerate(groups):
        kb.append([
            btn("➖", "g", cid, i, "dec"),
            btn(f"{i + 1}. {str(g.get('subject', ''))[:14]}: {int(g.get('freeSeats', 0))}", "g", cid, i, "noop"),
            btn("➕", "g", cid, i, "inc"),
        ])
        kb.append([btn("💰 Narx", "g", cid, i, "price"), btn("🗑 O‘chirish", "g", cid, i, "del")])
    kb.append([btn("➕ Guruh qo‘shish", "add", cid)])
    kb.append([btn("✅ Ma’lumotlar to‘g‘ri", "ok", cid)])
    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=kb)


async def send_panel(message: Message, cid: str):
    snap = await get_center(cid)
    if snap:
        text, kb = panel(cid, as_dict(snap))
        await message.answer(text, reply_markup=kb)


async def edit_panel(message, cid: str, data: dict):
    text, kb = panel(cid, data)
    try:
        await message.edit_text(text, reply_markup=kb)
    except TelegramBadRequest:
        pass  # "message is not modified" yoki xabar juda eski


async def check_owner(call: CallbackQuery, cid: str):
    snap = await get_center(cid)
    if not snap or as_dict(snap).get("ownerTgId") != call.from_user.id:
        await call.answer("Bu markazni boshqarishga ruxsatingiz yo‘q.", show_alert=True)
        return None
    return snap


def subjects_kb():
    rows, row = [], []
    for i, s in enumerate(SUBJECTS):
        row.append(btn(s, "subj", i))
        if len(row) == 2:
            rows.append(row)
            row = []
    if row:
        rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


def is_admin(uid: int) -> bool:
    return uid in ADMIN_IDS


# ---------------- Commands (har qanday holatda ishlaydi) ----------------
@router.message(Command("cancel"))
async def cancel(message: Message, state: FSMContext):
    had_state = await state.get_state() is not None
    await state.clear()
    await message.answer(
        "Bekor qilindi." if had_state else "Bekor qilinadigan amal yo‘q.",
        reply_markup=main_menu(),
    )


# Reply menyu tugmalari (matni bo'yicha ushlanadi)
BTN_INSTALL = "📲 O‘rnatib olish"
BTN_OPEN = "🚀 Ochish"
BTN_ADMIN = "💬 Admin bilan bog‘lanish"
BTN_TEACHER = "🎓 Ta’lim beruvchi bo‘lib kirish"


def ibtn(text: str, url: str, style: str | None = None) -> InlineKeyboardButton:
    """Mini App ochadigan inline tugma; style: primary (ko'k) / success (yashil) — logo ranglari."""
    return InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url), style=style)


def install_btn(text: str = "📲 Ilovani telefonga o‘rnatish") -> InlineKeyboardButton:
    """Havola tugmasi: sayt BRAUZERDA ochiladi va u yerdan alohida ilova sifatida o'rnatiladi
    (Telegram'ning «bosh ekranga qo'shish» yorlig'i har doim Telegram'ni ochadi)."""
    return InlineKeyboardButton(text=text, url=INSTALL_URL, style="success")


def main_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text=BTN_INSTALL, style="success"),  # bosilganda bot havola tugmasini yuboradi
                # Matn tugmasi: klaviatura tugmasidan ochilgan Mini App foydalanuvchi ma'lumotini (initData) OLMAYDI —
                # shunda AI, chat, kabinet ishlamaydi. Bot inline tugma yuboradi, u to'liq rejimda ochadi.
                KeyboardButton(text=BTN_OPEN, style="primary"),
            ],
            [KeyboardButton(text=BTN_ADMIN), KeyboardButton(text=BTN_TEACHER)],
        ],
        resize_keyboard=True,
        is_persistent=True,
        input_field_placeholder="Menyudan tanlang",
    )


def welcome_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [install_btn()],
        [ibtn("🚀 Telegramda ochish", WEBAPP_URL, "primary")],
    ])


# ---------------- Kanalga majburiy obuna (t.me/yaqindars) ----------------
# Bot kanalda ADMIN bo'lishi shart (a'zolikni tekshirish uchun). Tekshirib bo'lmasa — hech kimni bloklamaymiz.
REQUIRED_CHANNEL = os.getenv("REQUIRED_CHANNEL", "yaqindars").strip().lstrip("@")
SUB_OK_STATUSES = {"member", "administrator", "creator"}
_sub_cache: dict[int, float] = {}  # tasdiqlangan obunachilar: user_id -> vaqt (10 daqiqa eslab qolamiz)
_sub_warned = False


async def is_subscribed(bot: Bot, user_id: int) -> bool:
    global _sub_warned
    if not REQUIRED_CHANNEL or is_admin(user_id):
        return True
    if time.time() - _sub_cache.get(user_id, 0) < 600:
        return True
    try:
        m = await bot.get_chat_member(f"@{REQUIRED_CHANNEL}", user_id)
    except Exception as e:  # noqa: BLE001 — bot kanalda admin emas / kanal topilmadi
        if not _sub_warned:
            log.warning("Obunani tekshirib bo'lmadi (@%s): %s — botni kanalga ADMIN qiling. Hozircha tekshiruvsiz.", REQUIRED_CHANNEL, e)
            _sub_warned = True
        return True
    ok = getattr(m, "status", "") in SUB_OK_STATUSES or (getattr(m, "status", "") == "restricted" and getattr(m, "is_member", False))
    if ok:
        _sub_cache[user_id] = time.time()
    return ok


async def require_sub(message: Message, bot: Bot, then: str = "start") -> bool:
    """Obuna bo'lmagan bo'lsa — kanal tugmasi va «Obuna bo'ldim» ni ko'rsatadi, False qaytaradi."""
    if await is_subscribed(bot, message.from_user.id):
        return True
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [ibtn("📢 Kanalga obuna bo‘lish", f"https://t.me/{REQUIRED_CHANNEL}", "primary")],
        [InlineKeyboardButton(text="✅ Obuna bo‘ldim", callback_data=f"sub:{then}", style="success")],
    ])
    await message.answer(
        "👋 Assalomu alaykum!\n\nBotdan foydalanish uchun avval rasmiy kanalimizga obuna bo‘ling — "
        "u yerda yangi markazlar, bo‘sh joylar va chegirmalar haqida e’lon qilamiz.\n\n"
        "Obuna bo‘lgach, <b>«✅ Obuna bo‘ldim»</b> ni bosing.",
        reply_markup=kb,
    )
    return False


@router.callback_query(F.data.startswith("sub:"))
async def sub_check(call: CallbackQuery, state: FSMContext, bot: Bot):
    if not await is_subscribed(bot, call.from_user.id):
        return await call.answer("Hali obuna bo‘lmagansiz. Avval kanalga obuna bo‘ling 🙏", show_alert=True)
    await call.answer("Rahmat! ✅")
    try:
        await call.message.delete()
    except TelegramBadRequest:
        pass
    msg = call.message.model_copy(update={"from_user": call.from_user})  # davom etish uchun foydalanuvchi nomidan
    if call.data == "sub:markaz":
        return await markaz(msg, state, bot)
    if call.data == "sub:teacher":
        return await menu_teacher(msg, state, bot)
    await send_welcome(msg)


async def send_welcome(message: Message):
    name = escape(message.from_user.first_name or "")
    await message.answer(f"Assalomu alaykum{', ' + name if name else ''}! 👋", reply_markup=main_menu())
    await message.answer(
        "<b>YaqinDars</b> — uyingizga yaqin o‘quv markazlari, to‘garaklar va repetitorlar 📍\n\n"
        "🔎 Fan, narx va dars kunini tanlang\n"
        "🟢 Guruhda bo‘sh joy borligini darhol ko‘ring\n"
        "🎁 Bir bosishda <b>bepul sinov darsiga</b> yoziling\n"
        "👩‍🏫 O‘qituvchilar, sharoitlar va sharhlar bilan tanishing\n\n"
        "Ilovani telefoningizga o‘rnatib oling — bosh ekrandan bir bosishda ochiladi.",
        reply_markup=welcome_kb(),
    )


@router.message(CommandStart())
async def start(message: Message, state: FSMContext, command: CommandObject, bot: Bot):
    await state.clear()
    arg = (command.args or "").strip()
    if not await require_sub(message, bot, "markaz" if arg == "markaz" else "start"):
        return
    if arg == "markaz":  # t.me/BOT?start=markaz (ilovadagi «Markazingizni qo‘shing»)
        return await markaz(message, state, bot)
    await send_welcome(message)


@router.message(F.text == BTN_INSTALL)
@router.message(F.text == BTN_OPEN)
async def menu_open(message: Message, state: FSMContext, bot: Bot):
    await state.clear()
    if not await require_sub(message, bot):
        return
    if message.text == BTN_INSTALL:
        kb = InlineKeyboardMarkup(inline_keyboard=[[install_btn("📲 Brauzerda ochib o‘rnatish")]])
        return await message.answer(
            "📲 <b>Ilovani o‘rnatish</b>\n\n"
            "Tugmani bosing — sayt brauzerda ochiladi:\n"
            "• <b>Android (Chrome):</b> «O‘rnatish» oynasida «Ha» ni bosing\n"
            "• <b>iPhone (Safari):</b> «Ulashish» → «Bosh ekranga qo‘shish»\n\n"
            "Shundan keyin YaqinDars bosh ekranda alohida ilova bo‘lib turadi va Telegram’siz ochiladi.",
            reply_markup=kb,
        )
    kb = InlineKeyboardMarkup(inline_keyboard=[[ibtn("🚀 YaqinDars’ni ochish", WEBAPP_URL, "primary")]])
    await message.answer("Ilovani ochish uchun tugmani bosing 👇\n(yoki yozish maydoni yonidagi «Ochish» tugmasi)", reply_markup=kb)


@router.message(F.text == BTN_TEACHER)
async def menu_teacher(message: Message, state: FSMContext, bot: Bot):
    await state.clear()
    if not await require_sub(message, bot, "teacher"):
        return
    docs = await owner_centers(message.from_user.id)
    if not docs:
        await message.answer(
            "🎓 <b>Ta’lim beruvchi bo‘lib kirish</b>\n\n"
            "Siz hali markaz yoki repetitor sifatida ro‘yxatdan o‘tmagansiz.\n"
            f"{TARIFF_TEXT}\n\n"
            "Pastdagi <b>«📝 Markazni qo‘shish»</b> tugmasini bosing — 3–5 daqiqa.",
            reply_markup=register_keyboard(),
        )
        return
    kb = InlineKeyboardMarkup(inline_keyboard=[[ibtn("🎓 Kabinetni ochish", OWNER_URL, "primary")]])
    names = ", ".join(escape(str(as_dict(d).get("name", ""))) for d in docs)
    await message.answer(
        f"🎓 <b>Kabinet</b>: {names}\n\n"
        "Arizalarni qabul qilish, bo‘sh joylar va narxlarni boshqarish — hammasi bitta oynada.",
        reply_markup=kb,
    )


# ---------------- Admin bilan bog'lanish ----------------
# Admin kontaktlari («💬 Admin bilan bog'lanish»)
ADMIN_TG = "NOZIMJONS"
ADMIN_PHONE = "+998 90 389 21 26"


@router.message(F.text == BTN_ADMIN)
async def menu_admin(message: Message, state: FSMContext):
    await state.clear()
    rows = [[InlineKeyboardButton(text=f"✈️ Telegram: @{ADMIN_TG}", url=f"https://t.me/{ADMIN_TG}", style="primary")]]
    if ADMIN_IDS:
        rows.append([btn("✍️ Shu yerda yozish", "sup")])
    await message.answer(
        "💬 <b>Admin bilan bog‘lanish</b>\n\n"
        f"✈️ Telegram: @{ADMIN_TG}\n"
        f"📞 Telefon: {ADMIN_PHONE}\n\n"
        "Yoki savolingizni shu yerda yozing — adminga yetkazaman.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=rows),
    )


@router.callback_query(F.data == "sup")
async def support_start(call: CallbackQuery, state: FSMContext):
    await state.set_state(Support.ask)
    await call.message.answer("✍️ Savolingiz yoki taklifingizni bitta xabarda yozing.\n\nBekor qilish: /cancel")
    await call.answer()


@router.message(Support.ask, TEXT)
async def support_ask(message: Message, state: FSMContext, bot: Bot):
    await state.clear()
    u = message.from_user
    who = f"@{escape(u.username)}" if u.username else escape(u.full_name)
    kb = InlineKeyboardMarkup(inline_keyboard=[[btn("↩️ Javob berish", "sa", u.id)]])
    sent = 0
    for admin in ADMIN_IDS:
        try:
            await bot.send_message(admin, f"📩 <b>Murojaat</b> — {who} (<code>{u.id}</code>):\n\n{escape(message.text[:3000])}", reply_markup=kb)
            sent += 1
        except Exception as e:  # noqa: BLE001
            log.warning("Murojaat adminga yuborilmadi: %s", e)
    await message.answer(
        "✅ Xabaringiz adminga yuborildi. Javob shu chatga keladi." if sent else "Adminga yuborib bo‘lmadi, keyinroq urinib ko‘ring.",
        reply_markup=main_menu(),
    )


@router.callback_query(F.data.startswith("sa:"))
async def support_answer_start(call: CallbackQuery, state: FSMContext):
    if not is_admin(call.from_user.id):
        return await call.answer("Faqat admin uchun.", show_alert=True)
    await state.set_state(Support.answer)
    await state.update_data(to=int(call.data.split(":", 1)[1]))
    await call.message.answer("✍️ Javobingizni yozing (bekor qilish: /cancel):")
    await call.answer()


@router.message(Support.answer, TEXT)
async def support_answer_send(message: Message, state: FSMContext, bot: Bot):
    to = (await state.get_data()).get("to")
    await state.clear()
    try:
        await bot.send_message(to, f"💬 <b>Admin javobi:</b>\n{escape(message.text[:3000])}", reply_markup=main_menu())
        await message.answer("✅ Javob yuborildi.")
    except Exception as e:  # noqa: BLE001
        await message.answer(f"Yuborilmadi: {escape(str(e))[:200]}")


@router.message(Command("help"))
async def help_cmd(message: Message):
    text = (
        "/start — bosh menyu\n"
        "/markaz — markaz paneli (ro‘yxatdan o‘tish, guruhlar, bo‘sh joylar)\n"
        "/delete — barcha ma’lumotlarimni o‘chirish\n"
        "/cancel — joriy amalni bekor qilish\n"
        "/id — Telegram ID’ingizni bilish\n\n"
        f"🔒 <a href=\"{PRIVACY_URL}\">Maxfiylik siyosati</a>"
    )
    if is_admin(message.from_user.id):
        text += "\n\nAdmin:\n/admin — boshqaruv paneli (dashboard)\n/vip MARKAZ_ID — VIP ni yoqish/o‘chirish\n/stat — statistika\n/logs — oxirgi xatolar"
    await message.answer(text, disable_web_page_preview=True)


@router.message(Command("id"))
async def my_id(message: Message):
    await message.answer(f"Sizning Telegram ID: <code>{message.from_user.id}</code>")


def register_keyboard(text: str = "📝 Markazni qo‘shish") -> ReplyKeyboardMarkup:
    """Mini App faqat REPLY-klaviatura tugmasidan ochilganda sendData() ishlaydi."""
    return ReplyKeyboardMarkup(
        # ro'yxatdan o'tish tugmasi + asosiy menyu (menyu yo'qolib qolmasin)
        keyboard=[[KeyboardButton(text=text, web_app=WebAppInfo(url=REGISTER_URL), style="success")], *main_menu().keyboard],
        resize_keyboard=True,
        input_field_placeholder="Pastdagi tugmani bosing",
    )


TARIFF_TEXT = (
    f"💼 <b>Tariflar</b> (birinchi {TRIAL_DAYS} kun — bepul):\n"
    f"• <b>Oddiy</b> — repetitor {fmt_sum(tariff_price('tutor', 'oddiy'))}, o‘quv markazi {fmt_sum(tariff_price('center', 'oddiy'))}/oy: "
    "xaritada ko‘rinish, arizalar botga keladi\n"
    f"• <b>VIP</b> — {fmt_sum(TARIFF_PRICES['vip'])}/oy: ro‘yxatda birinchi, xaritada oltin belgi, «Tavsiya etilgan» bo‘limida"
)


@router.message(Command("markaz"))
async def markaz(message: Message, state: FSMContext, bot: Bot):
    await state.clear()
    if message.chat.type != "private":
        return await message.answer("Markaz paneli faqat bot bilan shaxsiy chatda ishlaydi.")
    if not await require_sub(message, bot, "markaz"):
        return
    docs = await owner_centers(message.from_user.id)
    if not docs:
        await message.answer(
            "🏫 <b>Markazingizni YaqinDars’ga qo‘shing</b>\n\n"
            f"{TARIFF_TEXT}\n\n"
            "Pastdagi <b>«📝 Markazni qo‘shish»</b> tugmasini bosing: tarif, ma’lumot, xaritadagi joy, "
            "guruhlar va o‘qituvchilarni 3–5 daqiqada kiritasiz.",
            reply_markup=register_keyboard(),
        )
        kb = InlineKeyboardMarkup(inline_keyboard=[[btn("💬 Matn orqali ro‘yxatdan o‘tish", "reg")]])
        await message.answer("Tugma ko‘rinmayaptimi? Telegram’ni yangilang yoki matn orqali o‘ting:", reply_markup=kb)
        return
    for d in docs:
        text, kb = panel(d.id, as_dict(d))
        await message.answer(text, reply_markup=kb)
    await message.answer(
        "Yana markaz yoki filial qo‘shish uchun pastdagi tugmani bosing.",
        reply_markup=register_keyboard("➕ Yangi markaz qo‘shish"),
    )


@router.message(F.web_app_data)
async def on_register_app(message: Message, state: FSMContext, bot: Bot):
    """Ro'yxatdan o'tish Mini App'idan kelgan ma'lumot.
    Telegram jo'natuvchini kafolatlaydi, mazmunini esa parse_registration tekshiradi."""
    await state.clear()
    try:
        data = parse_registration(message.web_app_data.data)
    except RegError as e:
        return await message.answer(
            f"⚠️ Ma’lumotda xato: {escape(str(e))}.\nTugmani qayta bosing — kiritganlaringiz saqlangan.",
            reply_markup=register_keyboard(),
        )
    user = message.from_user
    existing = [as_dict(c) for c in await owner_centers(user.id)]
    if len(existing) >= 5:
        return await message.answer(
            "Bitta akkauntga 5 tadan ortiq markaz qo‘shib bo‘lmaydi. Admin bilan bog‘laning.",
            reply_markup=main_menu(),
        )
    if any(c.get("name") == data["name"] and not c.get("approved") for c in existing):
        return await message.answer(
            "Bu markaz allaqachon yuborilgan va admin tekshiruvida. Panel: /markaz",
            reply_markup=main_menu(),
        )

    doc = {
        **data,
        "vip": False,  # VIP tarif admin tasdiqlaganda yoqiladi
        "rating": None,
        "approved": False,
        "ownerTgId": user.id,
        "ownerUsername": user.username,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "lastReminderAt": None,
    }
    _, ref = await asyncio.to_thread(CENTERS.add, doc)
    tariff_name = "VIP" if data["tariff"] == "vip" else "Oddiy"
    await message.answer(
        f"✅ <b>{escape(data['name'])}</b> qabul qilindi!\n"
        f"Tarif: {tariff_name} — {fmt_sum(tariff_price(data.get('kind'), data['tariff']))}/oy, birinchi {TRIAL_DAYS} kun bepul.\n\n"
        "Admin tekshirgach (odatda 1 kun ichida) markazingiz xaritada ko‘rinadi. "
        "Bo‘sh joylar va narxlarni quyidagi panelda boshqarasiz:",
        reply_markup=main_menu(),
    )
    await send_panel(message, ref.id)
    await notify_admins_new_center(bot, ref.id, doc, user)


async def notify_admins_new_center(bot: Bot, cid: str, data: dict, user):
    if not ADMIN_IDS:
        log.warning("ADMIN_IDS bo‘sh — yangi markazni tasdiqlaydigan admin yo‘q")
        return
    kb = InlineKeyboardMarkup(inline_keyboard=[[btn("✅ Tasdiqlash", "ap", cid), btn("❌ Rad etish", "rj", cid)]])
    who = f"@{user.username}" if user.username else f"{user.full_name} ({user.id})"
    tariff = data.get("tariff")
    lines = [
        f"🆕 Yangi {'repetitor' if data.get('kind') == 'tutor' else 'markaz'}: <b>{escape(data['name'])}</b>",
        f"💼 Tarif: <b>{'VIP' if tariff == 'vip' else 'Oddiy'}</b>" if tariff else "💼 Tarif: tanlanmagan (matn orqali)",
        f"📍 {escape(data['address'])}",
        f"📞 {escape(data['phone'])}",
        f"🏷 Sharoitlar: {escape(', '.join(data.get('amenities') or []) or '—')}",
    ]
    for g in data.get("groups") or []:
        lines.append(
            f"📚 {escape(g['subject'])} · {escape(', '.join(g['days']))} · {escape(g['time'])} · "
            f"{fmt_sum(g['price'])} · {g['freeSeats']} joy"
        )
    for t in data.get("teachers") or []:
        exp = f", {t['experience']} yil" if t.get("experience") else ""
        lines.append(f"👩‍🏫 {escape(t['name'])} — {escape(t['subject'])}{exp}")
    if data.get("description"):
        lines.append(f"📝 {escape(data['description'])}")
    lines += [f"👤 {escape(who)}", f"ID: <code>{cid}</code>"]
    text = "\n".join(lines)[:4000]
    for admin in ADMIN_IDS:
        try:
            await bot.send_message(admin, text, reply_markup=kb)
            await bot.send_location(admin, data["lat"], data["lng"])
        except Exception as e:  # noqa: BLE001
            log.warning("Admin %s ga yuborilmadi: %s", admin, e)


@router.message(Command("vip"))
async def toggle_vip(message: Message):
    if not is_admin(message.from_user.id):
        return
    parts = (message.text or "").split()
    if len(parts) != 2:
        return await message.answer("Foydalanish: /vip MARKAZ_ID")
    cid = parts[1]
    snap = await get_center(cid)
    if not snap:
        return await message.answer("Markaz topilmadi.")
    data = as_dict(snap)
    new = not bool(data.get("vip"))
    await asyncio.to_thread(CENTERS.document(cid).update, {"vip": new})
    await message.answer(f"{escape(data.get('name', cid))}: VIP {'yoqildi ⭐' if new else 'o‘chirildi'}")


@router.message(Command("stat"))
async def stat(message: Message):
    if not is_admin(message.from_user.id):
        return

    def count():
        centers = [as_dict(c) for c in CENTERS.stream()]
        apps = APPS.count().get()[0][0].value
        approved = sum(1 for c in centers if c.get("approved"))
        vip = sum(1 for c in centers if c.get("vip"))
        return len(centers), approved, vip, apps

    total, approved, vip, apps = await asyncio.to_thread(count)
    await message.answer(
        f"📊 Markazlar: {total}\n"
        f"✅ Tasdiqlangan: {approved}\n"
        f"⭐ VIP: {vip}\n"
        f"📝 Jami arizalar: {apps}"
    )


# ---------------- Center panel ----------------
@router.callback_query(F.data.startswith("panel:"))
async def open_panel(call: CallbackQuery):
    cid = call.data.split(":", 1)[1]
    if await check_owner(call, cid):
        await send_panel(call.message, cid)
        await call.answer()


@router.callback_query(F.data.startswith("ok:"))
async def confirm_fresh(call: CallbackQuery):
    cid = call.data.split(":", 1)[1]
    if not await check_owner(call, cid):
        return
    await asyncio.to_thread(CENTERS.document(cid).update, {"updatedAt": firestore.SERVER_TIMESTAMP})
    await call.answer("Rahmat! Ma’lumotlar tasdiqlandi ✅", show_alert=True)


@router.callback_query(F.data.startswith("g:"))
async def on_group(call: CallbackQuery, state: FSMContext):
    try:
        _, cid, idx_s, action = call.data.split(":")
        idx = int(idx_s)
    except ValueError:
        return await call.answer()
    if action == "noop":
        return await call.answer("➖ / ➕ tugmalari bilan bo‘sh joy sonini o‘zgartiring.")

    snap = await check_owner(call, cid)
    if not snap:
        return
    groups = as_dict(snap).get("groups") or []
    if idx >= len(groups):
        return await call.answer("Guruh topilmadi. /markaz ni qayta oching.", show_alert=True)

    if action == "price":
        await state.set_state(EditPrice.price)
        await state.update_data(cid=cid, idx=idx)
        await call.message.answer(
            f"«{escape(str(groups[idx].get('subject', '')))}» guruhi uchun yangi oylik narxni yozing "
            f"(hozir: {fmt_sum(groups[idx].get('price', 0))}).\nMasalan: 250000\n\nBekor qilish: /cancel"
        )
        return await call.answer()

    def change(gs):
        if idx >= len(gs):
            return False
        if action == "inc":
            gs[idx]["freeSeats"] = min(SEATS_MAX, int(gs[idx].get("freeSeats", 0)) + 1)
        elif action == "dec":
            if int(gs[idx].get("freeSeats", 0)) <= 0:
                return False
            gs[idx]["freeSeats"] = int(gs[idx]["freeSeats"]) - 1
        elif action == "del":
            gs.pop(idx)
        else:
            return False
        return True

    data = await update_groups(cid, call.from_user.id, change)
    if data is None:
        return await call.answer("Bu markazni boshqarishga ruxsatingiz yo‘q.", show_alert=True)
    await edit_panel(call.message, cid, data)
    # Joy 0 dan ko'paysa kutish ro'yxatiga xabarni start_seats_watcher yuboradi (bot va kabinet uchun bitta joy)
    await call.answer("Guruh o‘chirildi 🗑" if action == "del" else "Saqlandi ✅")


@router.message(EditPrice.price, TEXT)
async def edit_price(message: Message, state: FSMContext):
    price = parse_int(message.text, PRICE_MIN, PRICE_MAX)
    if price is None:
        return await message.answer(
            "Narxni so‘mda, faqat raqam bilan yozing (10 000 dan 10 000 000 gacha).\nMasalan: 250000"
        )
    data = await state.get_data()
    cid, idx = data["cid"], data["idx"]

    def change(gs):
        if idx >= len(gs):
            return False
        gs[idx]["price"] = price
        return True

    result = await update_groups(cid, message.from_user.id, change)
    await state.clear()
    if result is None:
        return await message.answer("Bu markazni boshqarishga ruxsatingiz yo‘q.")
    await message.answer(f"Narx saqlandi: {fmt_sum(price)} ✅")
    await send_panel(message, cid)


# ---------------- Registration ----------------
@router.callback_query(F.data == "reg")
async def reg_start(call: CallbackQuery, state: FSMContext):
    await state.clear()
    await state.set_state(Reg.name)
    await call.message.answer(
        "Markazingiz nomini yozing (masalan: «Bilimdon» o‘quv markazi):\n\nBekor qilish: /cancel"
    )
    await call.answer()


@router.message(Reg.name, TEXT)
async def reg_name(message: Message, state: FSMContext):
    name = message.text.strip()
    if not 2 <= len(name) <= 80:
        return await message.answer("Nom 2 dan 80 belgigacha bo‘lsin. Masalan: «Bilimdon» o‘quv markazi")
    await state.update_data(name=name)
    await state.set_state(Reg.address)
    await message.answer("Manzilni yozing (ko‘cha, mo‘ljal).\nMasalan: Rishton, Mustaqillik ko‘chasi 12, bozor yonida")


@router.message(Reg.address, TEXT)
async def reg_address(message: Message, state: FSMContext):
    address = message.text.strip()
    if not 3 <= len(address) <= 150:
        return await message.answer("Manzil 3 dan 150 belgigacha bo‘lsin. Masalan: Rishton, Navoiy ko‘chasi 5")
    await state.update_data(address=address)
    await state.set_state(Reg.location)
    kb = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="📍 Joylashuvni yuborish", request_location=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )
    await message.answer(
        "Markaz joylashuvini yuboring.\n"
        "Markaz binosida bo‘lsangiz — pastdagi tugmani bosing. "
        "Aks holda 📎 → «Joylashuv» orqali xaritadan nuqtani tanlang.",
        reply_markup=kb,
    )


@router.message(Reg.location, F.location)
async def reg_location(message: Message, state: FSMContext):
    await state.update_data(lat=message.location.latitude, lng=message.location.longitude)
    await state.set_state(Reg.phone)
    kb = ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="📞 Raqamni yuborish", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )
    await message.answer(
        "Markaz telefon raqamini yuboring yoki yozing.\nMasalan: +998 90 123 45 67",
        reply_markup=kb,
    )


@router.message(Reg.location, ~F.text.startswith("/"))
async def reg_location_wrong(message: Message):
    await message.answer("Iltimos, joylashuvni yuboring: «📍 Joylashuvni yuborish» tugmasi yoki 📎 → «Joylashuv».")


@router.message(Reg.phone, F.contact | TEXT)
async def reg_phone(message: Message, state: FSMContext):
    raw = message.contact.phone_number if message.contact else message.text
    phone = normalize_phone(raw)
    if not phone:
        return await message.answer("Raqamni +998 XX XXX XX XX ko‘rinishida yozing. Masalan: +998 90 123 45 67")
    await state.update_data(phone=phone)
    await state.set_state(Reg.amenities)
    await message.answer(
        "Sharoitlarni vergul bilan yozing.\nMasalan: Wi-Fi, kompyuter xonasi, konditsioner\n"
        "Yo‘q bo‘lsa «-» yuboring.",
        reply_markup=main_menu(),
    )


@router.message(Reg.amenities, TEXT)
async def reg_finish(message: Message, state: FSMContext, bot: Bot):
    text = message.text.strip()
    amenities = [] if text in {"-", "—", "yo‘q", "yo'q"} else [a.strip()[:30] for a in text.split(",") if a.strip()][:8]
    data = await state.get_data()
    user = message.from_user
    doc = {
        "name": data["name"],
        "address": data["address"],
        "lat": data["lat"],
        "lng": data["lng"],
        "phone": data["phone"],
        "amenities": amenities,
        "groups": [],
        "vip": False,
        "rating": None,
        "approved": False,
        "ownerTgId": user.id,
        "ownerUsername": user.username,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "lastReminderAt": None,
    }
    _, ref = await asyncio.to_thread(CENTERS.add, doc)
    await state.clear()

    await message.answer(
        "✅ Markaz ro‘yxatga olindi! Admin tekshirgach, xaritada ko‘rinadi.\n"
        "Hozirdan guruhlaringizni qo‘shib qo‘ying:"
    )
    await send_panel(message, ref.id)

    await notify_admins_new_center(bot, ref.id, doc, user)


# ---------------- Add group ----------------
@router.callback_query(F.data.startswith("add:"))
async def add_start(call: CallbackQuery, state: FSMContext):
    cid = call.data.split(":", 1)[1]
    if not await check_owner(call, cid):
        return
    await state.clear()
    await state.set_state(AddGroup.subject)
    await state.update_data(cid=cid)
    await call.message.answer("Fanni tanlang:\n\nBekor qilish: /cancel", reply_markup=subjects_kb())
    await call.answer()


DAYS_HINT = "Masalan: «Du, Ch, Ju» yoki «dushanba, chorshanba, juma».\nKunlar: Du, Se, Ch, Pa, Ju, Sh, Ya"


@router.callback_query(AddGroup.subject, F.data.startswith("subj:"))
async def add_subject(call: CallbackQuery, state: FSMContext):
    try:
        subject = SUBJECTS[int(call.data.split(":", 1)[1])]
    except (ValueError, IndexError):
        return await call.answer()
    try:
        await call.message.edit_reply_markup(reply_markup=None)
    except TelegramBadRequest:
        pass
    if subject == "Boshqa":
        await state.set_state(AddGroup.subject_text)
        await call.message.answer("Fan nomini yozing (masalan: Arab tili, Shaxmat):")
    else:
        await state.update_data(subject=subject)
        await state.set_state(AddGroup.days)
        await call.message.answer(f"Fan: <b>{subject}</b>\n\nDars kunlarini yozing.\n{DAYS_HINT}")
    await call.answer()


@router.message(AddGroup.subject_text, TEXT)
async def add_subject_text(message: Message, state: FSMContext):
    subject = message.text.strip()
    if not 2 <= len(subject) <= 30:
        return await message.answer("Fan nomi 2 dan 30 belgigacha bo‘lsin. Masalan: Arab tili")
    await state.update_data(subject=subject)
    await state.set_state(AddGroup.days)
    await message.answer(f"Dars kunlarini yozing.\n{DAYS_HINT}")


@router.message(AddGroup.days, TEXT)
async def add_days(message: Message, state: FSMContext):
    days = parse_days(message.text)
    if not days:
        return await message.answer(f"Kunlarni tushunmadim.\n{DAYS_HINT}")
    await state.update_data(days=days)
    await state.set_state(AddGroup.time)
    await message.answer(f"Kunlar: <b>{', '.join(days)}</b>\n\nDars vaqtini yozing.\nMasalan: 16:00-17:30")


@router.message(AddGroup.time, TEXT)
async def add_time(message: Message, state: FSMContext):
    t = parse_time(message.text)
    if not t:
        return await message.answer(
            "Vaqtni boshlanish va tugash soati bilan yozing.\nMasalan: 16:00-17:30 yoki 9.00-10.30"
        )
    await state.update_data(time=t)
    await state.set_state(AddGroup.price)
    await message.answer(f"Vaqt: <b>{t}</b>\n\nOylik narxni so‘mda yozing.\nMasalan: 250000")


@router.message(AddGroup.price, TEXT)
async def add_price(message: Message, state: FSMContext):
    price = parse_int(message.text, PRICE_MIN, PRICE_MAX)
    if price is None:
        return await message.answer(
            "Narxni so‘mda, faqat raqam bilan yozing (10 000 dan 10 000 000 gacha).\nMasalan: 250000"
        )
    await state.update_data(price=price)
    await state.set_state(AddGroup.seats)
    await message.answer(f"Narx: <b>{fmt_sum(price)}</b>\n\nGuruhda hozir nechta bo‘sh joy bor?\nMasalan: 3")


@router.message(AddGroup.seats, TEXT)
async def add_seats(message: Message, state: FSMContext):
    seats = parse_int(message.text, 0, SEATS_MAX)
    if seats is None:
        return await message.answer("0 dan 100 gacha raqam yozing. Masalan: 3 (joy qolmagan bo‘lsa — 0)")
    data = await state.get_data()
    cid = data["cid"]
    group = {
        "subject": data["subject"],
        "days": data["days"],
        "time": data["time"],
        "price": data["price"],
        "freeSeats": seats,
    }
    result = await update_groups(cid, message.from_user.id, lambda gs: gs.append(group))
    await state.clear()
    if result is None:
        return await message.answer("Bu markazni boshqarishga ruxsatingiz yo‘q.")
    await message.answer("Guruh qo‘shildi ✅")
    await send_panel(message, cid)


# ---------------- Ariza holati (markaz egasi) ----------------
APP_STATUS_TEXT = {"seen": "👁 Ko‘rildi", "accepted": "✅ Qabul qilindi", "rejected": "❌ Rad etildi"}


def app_kb(app_id: str, status: str = "new"):
    rows = []
    if status in ("new", "seen"):
        row = [btn("✅ Qabul qilish", "as", app_id, "ok"), btn("❌ Rad etish", "as", app_id, "no")]
        if status == "new":
            row.insert(0, btn("👁 Ko‘rdim", "as", app_id, "seen"))
        rows.append(row)
    return InlineKeyboardMarkup(inline_keyboard=rows)


async def notify_user(bot: Bot, tg_id, text: str, open_app: bool = True):
    """Ota-onaga Telegram xabari (botni boshlamagan bo'lsa — jim o'tkazib yuboriladi)."""
    if not isinstance(tg_id, int):
        return
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="📱 Ilovani ochish", web_app=WebAppInfo(url=WEBAPP_URL))]]) if open_app else None
    try:
        await bot.send_message(tg_id, text, reply_markup=kb)
    except Exception as e:  # noqa: BLE001
        log.info("Foydalanuvchi %s ga yuborilmadi: %s", tg_id, e)


@router.callback_query(F.data.startswith("as:"))
async def on_app_status(call: CallbackQuery, bot: Bot):
    try:
        _, app_id, action = call.data.split(":")
    except ValueError:
        return await call.answer()
    status = {"seen": "seen", "ok": "accepted", "no": "rejected"}.get(action)
    snap = await asyncio.to_thread(APPS.document(app_id).get) if status and "/" not in app_id else None
    if not snap or not snap.exists:
        return await call.answer("Ariza topilmadi.", show_alert=True)
    app = as_dict(snap)
    center = await check_owner(call, str(app.get("centerId", "")))
    if not center:
        return
    c = as_dict(center)
    upd = {"status": status, "statusBy": "bot", "statusNotified": status, "updatedAt": firestore.SERVER_TIMESTAMP}
    trial = None
    if status == "accepted":
        groups = c.get("groups") or []
        gi = app.get("groupIndex")
        g = groups[gi] if isinstance(gi, int) and 0 <= gi < len(groups) else None
        trial = next_lesson(g.get("days"), g.get("time")) if g else None
        if trial:
            upd["trialAt"] = trial
    await asyncio.to_thread(APPS.document(app_id).update, upd)
    if status == "accepted" and app.get("status") != "accepted":
        await asyncio.to_thread(bump_stat, str(app.get("centerId", "")), "accepted")

    try:
        await call.message.edit_text(f"{call.message.html_text}\n\n<b>{APP_STATUS_TEXT[status]}</b>", reply_markup=app_kb(app_id, status))
    except (TelegramBadRequest, AttributeError):
        pass
    await call.answer(APP_STATUS_TEXT[status])

    name = escape(str(c.get("name", "")))
    if status == "accepted":
        when = f"\n🗓 Sinov darsi: <b>{trial.strftime('%d.%m, %H:%M')}</b>" if trial else ""
        await notify_user(bot, app.get("tgUserId"), f"✅ <b>{name}</b> arizangizni qabul qildi!{when}\nMarkaz siz bilan telefon orqali bog‘lanadi.")
    elif status == "rejected":
        await notify_user(bot, app.get("tgUserId"), f"Afsuski, <b>{name}</b> hozircha arizangizni qabul qila olmadi. Ilovada boshqa guruhlarni ko‘ring.")


# ---------------- Chat: markaz egasi javob beradi ----------------
@router.callback_query(F.data.startswith("rp:"))
async def reply_start(call: CallbackQuery, state: FSMContext):
    chat_id = call.data.split(":", 1)[1]
    snap = await asyncio.to_thread(CHATS.document(chat_id).get) if "/" not in chat_id else None
    if not snap or not snap.exists:
        return await call.answer("Suhbat topilmadi (o‘chirilgan bo‘lishi mumkin).", show_alert=True)
    if not await check_owner(call, str(as_dict(snap).get("centerId", ""))):
        return
    await state.set_state(Reply.text)
    await state.update_data(chat_id=chat_id)
    who = escape(str(as_dict(snap).get("userName") or "Foydalanuvchi"))
    await call.message.answer(f"✍️ {who} ga javobingizni yozing:\n\nBekor qilish: /cancel")
    await call.answer()


@router.message(Reply.text, TEXT)
async def reply_send(message: Message, state: FSMContext, bot: Bot):
    data = await state.get_data()
    await state.clear()
    chat_id = data.get("chat_id", "")
    text = message.text.strip()[:2000]
    snap = await asyncio.to_thread(CHATS.document(chat_id).get)
    chat = as_dict(snap) if snap.exists else None
    center = await get_center(str(chat.get("centerId", ""))) if chat else None
    if not chat or not center or as_dict(center).get("ownerTgId") != message.from_user.id:
        return await message.answer("Suhbat topilmadi.")

    def write():
        batch = db.batch()
        batch.set(CHATS.document(chat_id).collection("messages").document(), {
            "from": "center", "text": text, "createdAt": firestore.SERVER_TIMESTAMP, "notified": True,
        })
        batch.update(CHATS.document(chat_id), {
            "lastMessage": text[:200], "lastAt": firestore.SERVER_TIMESTAMP, "unreadUser": firestore.Increment(1),
        })
        batch.commit()

    await asyncio.to_thread(write)
    kb = InlineKeyboardMarkup(inline_keyboard=[[btn("↩️ Yana yozish", "rp", chat_id)]])
    await message.answer("✅ Javob yuborildi.", reply_markup=kb)
    await notify_user(bot, chat.get("userTgId"), f"💬 <b>{escape(str(chat.get('centerName', 'Markaz')))}</b>:\n{escape(text)}")


# ---------------- Ma'lumotlarni o'chirish (/delete va ilovadagi tugma) ----------------
def _delete_query(q) -> int:
    n = 0
    for d in q.stream():
        d.reference.delete()
        n += 1
    return n


def delete_user_data(tg_id: int) -> dict:
    """Foydalanuvchining barcha shaxsiy ma'lumotlari: profil, farzandlar, saqlanganlar, arizalar, chatlar, navbatlar.
    Markaz egasining markazlari (ochiq biznes ma'lumoti) bu yerda o'chirilmaydi — admin orqali."""
    out = {}
    user_ref = USERS.document(str(tg_id))
    out["farzandlar"] = _delete_query(user_ref.collection("children"))
    out["saqlanganlar"] = _delete_query(user_ref.collection("favorites"))
    user_ref.delete()
    out["arizalar"] = _delete_query(APPS.where(filter=FieldFilter("tgUserId", "==", tg_id)))
    chats = list(CHATS.where(filter=FieldFilter("userTgId", "==", tg_id)).stream())
    for c in chats:
        _delete_query(c.reference.collection("messages"))
        c.reference.delete()
    out["chatlar"] = len(chats)
    out["navbatlar"] = _delete_query(WAITLIST.where(filter=FieldFilter("userTgId", "==", tg_id)))
    out["kuzatuvlar"] = _delete_query(WATCHES.where(filter=FieldFilter("userTgId", "==", tg_id)))
    # Baholar: shaxsiy yozuv (izoh) o'chadi; markazning umumiy o'rtachasi anonim qoladi
    out["baholar"] = _delete_query(RATINGS.where(filter=FieldFilter("userTgId", "==", tg_id)))
    out["shikoyatlar"] = _delete_query(REPORTS.where(filter=FieldFilter("tgId", "==", tg_id)))
    # Telegram bog'lanishi: claim'ni olib tashlaymiz (anonim akkaunt boshqa hech narsani ko'ra olmaydi)
    for link in LINKS.where(filter=FieldFilter("tg", "==", tg_id)).stream():
        try:
            fb_auth.set_custom_user_claims(link.id, None)
        except Exception as e:  # noqa: BLE001
            log.info("Claim olib tashlanmadi (%s): %s", link.id, e)
        link.reference.delete()
    return out


def deleted_text(counts: dict) -> str:
    parts = ", ".join(f"{k}: {v}" for k, v in counts.items() if v)
    return "🗑 Ma’lumotlaringiz o‘chirildi." + (f"\n({parts})" if parts else "")


@router.message(Command("delete"))
async def delete_cmd(message: Message, state: FSMContext):
    await state.clear()
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🗑 Ha, o‘chirish", callback_data="del:yes", style="danger"),
        InlineKeyboardButton(text="Bekor qilish", callback_data="del:no"),
    ]])
    await message.answer(
        "⚠️ <b>Barcha ma’lumotlaringiz o‘chiriladi:</b>\n"
        "profil, farzandlar, saqlanganlar, arizalar, chatlar va navbatlar.\n\n"
        "Bu amalni qaytarib bo‘lmaydi. Davom etasizmi?",
        reply_markup=kb,
    )


@router.callback_query(F.data.in_({"del:yes", "del:no"}))
async def delete_confirm(call: CallbackQuery):
    if call.data == "del:no":
        await call.message.edit_text("Bekor qilindi. Ma’lumotlaringiz joyida.")
        return await call.answer()
    await call.answer("O‘chirilmoqda…")
    counts = await asyncio.to_thread(delete_user_data, call.from_user.id)
    log.info("Foydalanuvchi %s ma'lumotlarini o'chirdi: %s", call.from_user.id, counts)
    await call.message.edit_text(deleted_text(counts))


# ---------------- Xatolarni Firestore'ga yozish (logs, faqat admin o'qiydi) ----------------
class FirestoreLogHandler(logging.Handler):
    """ERROR va undan yuqori yozuvlarni logs kolleksiyasiga yozadi. Soatiga ko'pi bilan 30 ta."""

    def __init__(self):
        super().__init__(level=logging.ERROR)
        self._window = time.time()
        self._count = 0

    def emit(self, record: logging.LogRecord):
        now = time.time()
        if now - self._window > 3600:
            self._window, self._count = now, 0
        if self._count >= 30:
            return
        self._count += 1
        try:
            stack = "".join(traceback.format_exception(*record.exc_info)) if record.exc_info else ""
            db.collection("logs").add({
                "source": "bot",
                "level": record.levelname.lower(),
                "message": record.getMessage()[:1000],
                "stack": stack[-2000:],
                "screen": record.name[:100],
                "device": f"{platform.node()} · Python {platform.python_version()}"[:300],
                "url": "",
                "createdAt": firestore.SERVER_TIMESTAMP,
            })
        except Exception:  # noqa: BLE001
            pass  # log yozilmasa — jim (cheksiz siklga tushmaslik uchun)


def install_firestore_logging():
    """Firestore'ga yozish alohida oqimda — bot sekinlashmaydi."""
    q: queue.Queue = queue.Queue(-1)
    logging.getLogger().addHandler(logging.handlers.QueueHandler(q))
    listener = logging.handlers.QueueListener(q, FirestoreLogHandler(), respect_handler_level=True)
    listener.start()
    return listener


@router.errors()
async def on_error(event: ErrorEvent):
    upd = event.update
    who = ""
    if upd.message and upd.message.from_user:
        who = f" (user {upd.message.from_user.id}, matn: {(upd.message.text or '')[:60]!r})"
    elif upd.callback_query:
        who = f" (user {upd.callback_query.from_user.id}, tugma: {upd.callback_query.data!r})"
    log.error("Update %s ni qayta ishlashda xato%s", upd.update_id, who, exc_info=event.exception)
    return True


@router.message(Command("admin"))
async def admin_dashboard(message: Message):
    if not is_admin(message.from_user.id):
        return
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [ibtn("📊 Admin panelni ochish", ADMIN_URL, "primary")],
        [InlineKeyboardButton(text="➕ Markaz qo‘shish", callback_data="aa:new", style="success")],
    ])
    await message.answer(
        "📊 <b>Admin panel</b>\n\nMarkazlar, arizalar, daromad, AI va xatolar — bitta oynada. "
        "Kompyuterdagi Telegram’da keng oynada qulayroq.\n\n"
        "<code>/claimcode markazId</code> — egasi uchun kod\n<code>/link kanal</code> — kampaniya havolasi\n/backup — zaxira nusxa",
        reply_markup=kb,
    )


@router.message(Command("logs"))
async def logs_cmd(message: Message):
    if not is_admin(message.from_user.id):
        return
    q = db.collection("logs").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(10)
    docs = await asyncio.to_thread(lambda: list(q.stream()))
    if not docs:
        return await message.answer("✅ Xato yozuvlari yo‘q.")
    lines = []
    for d in docs:
        x = as_dict(d)
        t = x.get("createdAt")
        when = t.astimezone(TASHKENT).strftime("%d.%m %H:%M") if isinstance(t, datetime) else "?"
        lines.append(f"• <b>{escape(str(x.get('source')))}</b> {when} · {escape(str(x.get('screen', '')))}\n  {escape(str(x.get('message', ''))[:200])}")
    await message.answer("🧾 <b>Oxirgi xatolar</b>\n\n" + "\n".join(lines))


# ---------------- Admin: approve / reject ----------------
@router.callback_query(F.data.startswith(("ap:", "rj:")))
async def admin_decide(call: CallbackQuery, bot: Bot):
    if not is_admin(call.from_user.id):
        return await call.answer("Faqat admin uchun.", show_alert=True)
    action, cid = call.data.split(":", 1)
    snap = await get_center(cid)
    if not snap:
        return await call.answer("Markaz topilmadi (ehtimol, allaqachon rad etilgan).", show_alert=True)
    owner = as_dict(snap).get("ownerTgId")
    if action == "ap":
        vip_on = as_dict(snap).get("tariff") == "vip"
        upd = {"approved": True, "updatedAt": firestore.SERVER_TIMESTAMP}
        if vip_on:
            upd["vip"] = True  # VIP tarif: birinchi 15 kun bepul
        await asyncio.to_thread(CENTERS.document(cid).update, upd)
        mark = "✅ Tasdiqlandi" + (" (⭐ VIP)" if vip_on else "")
        msg = "🎉 Markazingiz tasdiqlandi va xaritada ko‘rinmoqda!\nGuruhlar va bo‘sh joylarni boshqarish: /markaz"
    else:
        await asyncio.to_thread(CENTERS.document(cid).delete)
        mark = "❌ Rad etildi"
        msg = "Afsuski, markazingiz ro‘yxatdan o‘tkazilmadi. Savollar bo‘lsa, admin bilan bog‘laning."
    try:
        await call.message.edit_text(f"{call.message.html_text}\n\n{mark}")
    except (TelegramBadRequest, AttributeError):
        pass
    if owner:
        try:
            await bot.send_message(owner, msg)
        except Exception as e:  # noqa: BLE001
            log.warning("Egaga yuborilmadi: %s", e)
    await call.answer(mark)


# ---------------- Fallbacks: alohida router, Dispatcher'ga ENG OXIRIDA ulanadi ----------------
fallback_router = Router()


@fallback_router.callback_query()
async def stale_callback(call: CallbackQuery):
    await call.answer("Bu tugma eskirgan. /markaz ni qayta oching.")


@fallback_router.message(StateFilter(None))
async def no_state(message: Message):
    # bitta xabar; pastki menyu /start'dan beri doim turadi
    await message.answer("Quyidagilardan birini tanlang yoki pastdagi menyudan foydalaning 👇", reply_markup=welcome_kb())


@fallback_router.message()
async def wrong_input(message: Message):
    await message.answer("Iltimos, so‘ralgan ma’lumotni yuboring. Bekor qilish: /cancel")


# ---------------- Applications -> center owner ----------------
@firestore.transactional
def _claim_txn(transaction, ref):
    """notified=false bo'lsa true qiladi va ma'lumotni qaytaradi; aks holda None (takroriy xabar bo'lmasin)."""
    snap = ref.get(transaction=transaction)
    if not snap.exists:
        return None
    data = as_dict(snap)
    if data.get("notified"):
        return None
    transaction.update(ref, {"notified": True})
    return data


_in_flight: set[str] = set()


async def notify_application(bot: Bot, ref):
    if ref.id in _in_flight:
        return
    _in_flight.add(ref.id)
    try:
        data = await asyncio.to_thread(lambda: _claim_txn(db.transaction(), ref))
        if not data:
            return
        center = await get_center(str(data.get("centerId", "")))
        if not center:
            log.warning("Ariza %s: markaz topilmadi (%s)", ref.id, data.get("centerId"))
            return
        c = as_dict(center)
        await asyncio.to_thread(bump_stat, center.id, "apps")
        await asyncio.to_thread(bump_source, data.get("source"))
        if not c.get("ownerTgId"):
            await notify_admins_ownerless_app(bot, center.id, c, data)
            return
        user = f"\n💬 @{escape(str(data['tgUsername']))}" if data.get("tgUsername") else ""
        text = (
            "🔔 <b>Yangi ariza — bepul sinov darsi</b>\n\n"
            f"🏫 {escape(str(c.get('name', '')))}\n"
            f"📚 {escape(str(data.get('group', '')))}\n"
            f"👤 {escape(str(data.get('name', '')))}\n"
            f"📞 {escape(str(data.get('phone', '')))}{user}\n\n"
            "O‘quvchi bilan tezroq bog‘laning va holatini belgilang 👇"
        )
        try:
            await bot.send_message(c.get("ownerTgId"), text, reply_markup=app_kb(ref.id))
        except Exception as e:  # noqa: BLE001
            log.warning("Ariza %s egaga yuborilmadi: %s", ref.id, e)
    except Exception:  # noqa: BLE001
        log.exception("Ariza %s ni qayta ishlashda xato", ref.id)
    finally:
        _in_flight.discard(ref.id)


def start_application_watcher(bot: Bot, loop: asyncio.AbstractEventLoop):
    # on_snapshot alohida thread'da chaqiriladi -> korutinani asosiy loop'ga topshiramiz
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name == "ADDED":
                asyncio.run_coroutine_threadsafe(notify_application(bot, ch.document.reference), loop)

    return APPS.where(filter=FieldFilter("notified", "==", False)).on_snapshot(on_snapshot)


# ---------------- Telegram tasdiqlash (Mini App anonim login -> tg claim) ----------------
def _link(doc_ref, init_data: str):
    user = validate_init_data(init_data, BOT_TOKEN)
    if not user:
        doc_ref.update({"status": "error", "initData": firestore.DELETE_FIELD})
        return
    try:
        claims = {"tg": int(user["id"])}
        if int(user["id"]) in ADMIN_IDS:
            claims["admin"] = True  # firestore.rules: logs faqat admin o'qiydi
        fb_auth.set_custom_user_claims(doc_ref.id, claims)
    except Exception as e:  # noqa: BLE001
        log.warning("Claim qo‘yilmadi (%s): %s", doc_ref.id, e)
        doc_ref.update({"status": "error", "initData": firestore.DELETE_FIELD})
        return
    doc_ref.update({"status": "ok", "tg": int(user["id"]), "initData": firestore.DELETE_FIELD})


def start_link_watcher():
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name in ("ADDED", "MODIFIED"):
                d = as_dict(ch.document)
                if d.get("status") == "pending" and isinstance(d.get("initData"), str):
                    try:
                        _link(ch.document.reference, d["initData"])
                    except Exception:  # noqa: BLE001
                        log.exception("tgLink %s", ch.document.id)

    return LINKS.where(filter=FieldFilter("status", "==", "pending")).on_snapshot(on_snapshot)


# ---------------- Chat: foydalanuvchi xabari -> markaz egasiga ----------------
@firestore.transactional
def _claim_msg_txn(transaction, ref):
    snap = ref.get(transaction=transaction)
    if not snap.exists or as_dict(snap).get("notified"):
        return None
    transaction.update(ref, {"notified": True})
    return as_dict(snap)


async def relay_chat(bot: Bot, chat_ref):
    try:
        chat_snap = await asyncio.to_thread(chat_ref.get)
        chat = as_dict(chat_snap)
        center = await get_center(str(chat.get("centerId", "")))
        if not center:
            return
        owner = as_dict(center).get("ownerTgId")
        q = chat_ref.collection("messages").where(filter=FieldFilter("notified", "==", False))
        msgs = await asyncio.to_thread(lambda: list(q.stream()))
        for m in sorted(msgs, key=lambda x: str(as_dict(x).get("createdAt"))):
            data = await asyncio.to_thread(lambda r=m.reference: _claim_msg_txn(db.transaction(), r))
            if not data or data.get("from") != "user":
                continue
            who = escape(str(chat.get("userName") or "Ota-ona"))
            if chat.get("userUsername"):
                who += f" (@{escape(str(chat['userUsername']))})"
            kb = InlineKeyboardMarkup(inline_keyboard=[[btn("↩️ Javob berish", "rp", chat_ref.id)]])
            try:
                await bot.send_message(owner, f"💬 <b>{who}</b> → {escape(str(chat.get('centerName', '')))}:\n{escape(str(data.get('text', '')))}", reply_markup=kb)
            except Exception as e:  # noqa: BLE001
                log.warning("Chat xabari egaga yuborilmadi: %s", e)
        await asyncio.to_thread(chat_ref.update, {"unreadCenter": 0})
    except Exception:  # noqa: BLE001
        log.exception("Chat %s ni uzatishda xato", chat_ref.id)


def start_chat_watcher(bot: Bot, loop: asyncio.AbstractEventLoop):
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name in ("ADDED", "MODIFIED"):
                asyncio.run_coroutine_threadsafe(relay_chat(bot, ch.document.reference), loop)

    return CHATS.where(filter=FieldFilter("unreadCenter", ">", 0)).on_snapshot(on_snapshot)


# ---------------- Kutish ro'yxati: joy bo'shadi ----------------
async def notify_waitlist(bot: Bot, cid: str, idx: int, center: dict):
    try:
        q = WAITLIST.where(filter=FieldFilter("centerId", "==", cid))
        docs = await asyncio.to_thread(lambda: list(q.stream()))
        g = (center.get("groups") or [])[idx]
        for d in docs:
            w = as_dict(d)
            if w.get("groupIndex") != idx or w.get("notified"):
                continue
            if not await claim_if(d.reference, lambda x: not x.get("notified"), {"notified": True}):
                continue  # parallel ishga tushgan boshqa chaqiruv allaqachon yubordi
            uid = w.get("userTgId")
            prefs = as_dict(await asyncio.to_thread(USERS.document(str(uid)).get)) if isinstance(uid, int) else {}
            if (prefs.get("notify") or {}).get("seats") is not False:
                await notify_user(
                    bot, uid,
                    f"🎉 <b>{escape(str(center.get('name', '')))}</b> — «{escape(str(g.get('subject', '')))}» guruhida joy bo‘shadi!\n"
                    "Tezroq yoziling — joylar cheklangan.",
                )
    except Exception:  # noqa: BLE001
        log.exception("Kutish ro‘yxati (%s) xabarlarida xato", cid)


# ---------------- Sinov darsi eslatmasi ----------------
async def remind_trials(bot: Bot):
    now = datetime.now(timezone.utc)
    q = APPS.where(filter=FieldFilter("status", "==", "accepted"))
    for d in await asyncio.to_thread(lambda: list(q.stream())):
        a = as_dict(d)
        t = a.get("trialAt")
        if a.get("trialReminded") or not isinstance(t, datetime) or not now < t <= now + timedelta(hours=24):
            continue
        uid = a.get("tgUserId")
        prefs = as_dict(await asyncio.to_thread(USERS.document(str(uid)).get)) if isinstance(uid, int) else {}
        if (prefs.get("notify") or {}).get("reminders") is not False:
            local = t.astimezone(TASHKENT)
            await notify_user(
                bot, uid,
                f"⏰ Eslatma: <b>{escape(str(a.get('centerName', '')))}</b> — sinov darsi "
                f"{local.strftime('%d.%m')} kuni soat <b>{local.strftime('%H:%M')}</b> da.\n{escape(str(a.get('group', '')))}",
            )
        await asyncio.to_thread(d.reference.update, {"trialReminded": True})


# ---------------- Takroriy xabarlarga qarshi: tranzaksion «band qilish» ----------------
@firestore.transactional
def _claim_if_txn(transaction, ref, check, patch: dict):
    """check(data) True bo'lsa patch'ni yozadi va data'ni qaytaradi; aks holda None.
    Bir xil hodisa ikki marta kelsa ham (snapshot ADDED+MODIFIED, tez bosishlar) faqat bittasi o'tadi."""
    snap = ref.get(transaction=transaction)
    if not snap.exists:
        return None
    data = as_dict(snap)
    if not check(data):
        return None
    transaction.update(ref, patch)
    return data


async def claim_if(ref, check, patch: dict):
    return await asyncio.to_thread(lambda: _claim_if_txn(db.transaction(), ref, check, patch))


# ---------------- Kabinetdagi o'zgarishlar -> ota-onalarga xabar ----------------
async def notify_status_from_web(bot: Bot, ref):
    snap = await asyncio.to_thread(ref.get)
    st = as_dict(snap).get("status")
    if st not in ("accepted", "rejected"):
        return
    a = await claim_if(
        ref,
        lambda d: d.get("statusBy") == "web" and d.get("status") == st and d.get("statusNotified") != st,
        {"statusNotified": st},
    )
    if not a:
        return  # boshqa hodisa allaqachon yubordi
    name = escape(str(a.get("centerName", "")))
    if st == "accepted":
        await asyncio.to_thread(bump_stat, str(a.get("centerId", "")), "accepted")
        t = a.get("trialAt")
        when = f"\n🗓 Sinov darsi: <b>{t.astimezone(TASHKENT).strftime('%d.%m, %H:%M')}</b>" if isinstance(t, datetime) else ""
        await notify_user(bot, a.get("tgUserId"), f"✅ <b>{name}</b> arizangizni qabul qildi!{when}\nMarkaz siz bilan telefon orqali bog‘lanadi.")
    else:
        await notify_user(bot, a.get("tgUserId"), f"Afsuski, <b>{name}</b> hozircha arizangizni qabul qila olmadi. Ilovada boshqa guruhlarni ko‘ring.")


def start_status_watcher(bot: Bot, loop: asyncio.AbstractEventLoop):
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name in ("ADDED", "MODIFIED"):
                asyncio.run_coroutine_threadsafe(notify_status_from_web(bot, ch.document.reference), loop)

    return APPS.where(filter=FieldFilter("statusBy", "==", "web")).on_snapshot(on_snapshot)


_seats: dict[str, list[int]] = {}


def start_seats_watcher(bot: Bot, loop: asyncio.AbstractEventLoop):
    """Guruhda joy 0 dan ko'paysa (bot ➕ yoki kabinet orqali) — kutish ro'yxatiga xabar."""
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            c = as_dict(ch.document)
            now = [int(g.get("freeSeats", 0) or 0) for g in (c.get("groups") or [])]
            prev = _seats.get(ch.document.id)
            _seats[ch.document.id] = now
            if ch.type.name != "MODIFIED" or prev is None:
                continue
            for i, n in enumerate(now):
                if n > 0 and i < len(prev) and prev[i] <= 0:
                    asyncio.run_coroutine_threadsafe(notify_waitlist(bot, ch.document.id, i, c), loop)
                # Saqlangan qidiruvlar: joy 0 dan ko'paydi yoki joyli yangi guruh qo'shildi
                if n > 0 and (i >= len(prev) or prev[i] <= 0):
                    asyncio.run_coroutine_threadsafe(notify_watches(bot, ch.document.id, i, c), loop)

    return CENTERS.where(filter=FieldFilter("approved", "==", True)).on_snapshot(on_snapshot)


# ---------------- Ilovadan o'chirish so'rovi ----------------
async def process_delete_request(bot: Bot, ref):
    try:
        tg_id = int(ref.id)
    except ValueError:
        return
    counts = await asyncio.to_thread(delete_user_data, tg_id)
    await asyncio.to_thread(ref.set, {"status": "done", "doneAt": firestore.SERVER_TIMESTAMP})
    log.info("Ilova orqali o'chirildi %s: %s", tg_id, counts)
    try:
        await bot.send_message(tg_id, deleted_text(counts) + "\n\nIlova orqali so‘ralgan.")
    except Exception:  # noqa: BLE001
        pass


def start_delete_watcher(bot: Bot, loop: asyncio.AbstractEventLoop):
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name in ("ADDED", "MODIFIED") and as_dict(ch.document).get("status") == "pending":
                asyncio.run_coroutine_threadsafe(process_delete_request(bot, ch.document.reference), loop)

    return DELETE_REQS.where(filter=FieldFilter("status", "==", "pending")).on_snapshot(on_snapshot)


# ---------------- Kunlik tozalash (maxfiylik siyosati) ----------------
def _delete_older(col, field: str, before: datetime, batch_size: int = 300) -> int:
    total = 0
    while True:
        docs = list(col.where(filter=FieldFilter(field, "<", before)).limit(batch_size).stream())
        if not docs:
            return total
        batch = db.batch()
        for d in docs:
            batch.delete(d.reference)
        batch.commit()
        total += len(docs)


def cleanup_once(now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    return {
        "arizalar": _delete_older(APPS, "createdAt", now - APPS_RETENTION),
        "loglar": _delete_older(db.collection("logs"), "createdAt", now - LOGS_RETENTION),
        "ai_savollar": _delete_older(AI_REQS, "createdAt", now - timedelta(days=1)),
    }


async def cleanup_loop():
    while True:
        try:
            res = await asyncio.to_thread(cleanup_once)
            if any(res.values()):
                log.info("Kunlik tozalash: %s", res)
        except Exception:  # noqa: BLE001
            log.exception("Kunlik tozalashda xato")
        await asyncio.sleep(CLEANUP_EVERY)


# ---------------- AI yordamchi (Groq): ilova savoli -> javob ----------------
_ai_usage: dict[int, list[float]] = {}
_centers_cache: dict = {"at": 0.0, "items": []}


def _approved_centers() -> list:
    """Tasdiqlangan markazlar (5 daqiqa keshda — har savolda bazani o'qimaslik uchun)."""
    if time.time() - _centers_cache["at"] > 300:
        items = []
        for d in CENTERS.where(filter=FieldFilter("approved", "==", True)).stream():
            c = as_dict(d)
            c["id"] = d.id
            items.append(c)
        _centers_cache.update(at=time.time(), items=items)
    return _centers_cache["items"]


def _ai_allowed(uid: int) -> bool:
    now = time.time()
    hist = [t for t in _ai_usage.get(uid, []) if now - t < 3600]
    if len(hist) >= AI_PER_HOUR:
        _ai_usage[uid] = hist
        return False
    hist.append(now)
    _ai_usage[uid] = hist
    return True


async def groq_chat(messages: list) -> str:
    timeout = aiohttp.ClientTimeout(total=25)
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ssl_context()), timeout=timeout) as s:
        async with s.post(
            GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json={
                "model": GROQ_MODEL,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 600,
                "response_format": {"type": "json_object"},
            },
        ) as r:
            if r.status != 200:
                raise RuntimeError(f"Groq {r.status}: {(await r.text())[:300]}")
            data = await r.json()
            return data["choices"][0]["message"]["content"]


async def process_ai_request(ref):
    req = await claim_if(ref, lambda d: d.get("status") == "pending", {"status": "processing"})
    if not req:
        return
    uid = req.get("userTgId")
    if not isinstance(uid, int) or not _ai_allowed(uid):
        await asyncio.to_thread(ref.update, {"status": "done", "text": "Bir soatda juda ko‘p savol berildi. Birozdan keyin qayta urinib ko‘ring.", "cards": []})
        return
    try:
        pos = req.get("pos") or {}
        lat, lng = float(pos.get("lat", 40.3567)), float(pos.get("lng", 71.2847))
        catalog, ids = ai_catalog(await asyncio.to_thread(_approved_centers), lat, lng)
        messages = [{"role": "system", "content": AI_SYSTEM + "\n\nKATALOG (foydalanuvchiga eng yaqinlari):\n" + catalog}]
        for h in (req.get("history") or [])[-6:]:
            if isinstance(h, dict) and isinstance(h.get("text"), str):
                messages.append({"role": "assistant" if h.get("from") == "ai" else "user", "content": h["text"][:500]})
        messages.append({"role": "user", "content": str(req.get("query", ""))[:500]})
        reply = parse_ai_reply(await groq_chat(messages), ids)
        if not reply:
            raise RuntimeError("AI javobi yaroqsiz")
        await asyncio.to_thread(ref.update, {"status": "done", **reply, "doneAt": firestore.SERVER_TIMESTAMP})
    except Exception as e:  # noqa: BLE001
        log.warning("AI so'rovi bajarilmadi: %s", e)
        await asyncio.to_thread(ref.update, {"status": "error"})  # ilova oddiy qidiruvga o'tadi


def start_ai_watcher(loop: asyncio.AbstractEventLoop):
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name == "ADDED":
                asyncio.run_coroutine_threadsafe(process_ai_request(ch.document.reference), loop)

    return AI_REQS.where(filter=FieldFilter("status", "==", "pending")).on_snapshot(on_snapshot)


# ---------------- Admin panel: tasdiqlash / rad etish -> egaga xabar ----------------
async def process_web_approval(bot: Bot, ref):
    snap = await asyncio.to_thread(ref.get)
    st = as_dict(snap).get("status")
    if st not in ("approved", "rejected"):
        return
    c = await claim_if(
        ref,
        lambda d: d.get("approvedBy") == "web" and d.get("status") == st and d.get("approvalNotified") != st,
        {"approvalNotified": st},
    )
    if not c:
        return
    owner, name = c.get("ownerTgId"), escape(str(c.get("name", "")))
    if st == "approved":
        vip = f" ⭐ VIP tarif yoqildi (birinchi {TRIAL_DAYS} kun bepul)." if c.get("vip") else ""
        text = f"🎉 <b>{name}</b> tasdiqlandi va xaritada ko‘rinmoqda!{vip}\nGuruhlar va bo‘sh joylarni boshqarish: /markaz"
    else:
        text = f"Afsuski, <b>{name}</b> ro‘yxatdan o‘tkazilmadi. Savollar bo‘lsa — «💬 Admin bilan bog‘lanish»."
        await asyncio.to_thread(ref.delete)
    if isinstance(owner, int):
        try:
            await bot.send_message(owner, text)
        except Exception as e:  # noqa: BLE001
            log.info("Egaga yuborilmadi: %s", e)


def start_approval_watcher(bot: Bot, loop: asyncio.AbstractEventLoop):
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name in ("ADDED", "MODIFIED"):
                asyncio.run_coroutine_threadsafe(process_web_approval(bot, ch.document.reference), loop)

    return CENTERS.where(filter=FieldFilter("approvedBy", "==", "web")).on_snapshot(on_snapshot)


def ensure_admin_claims():
    """ADMIN_IDS dagilarning allaqachon ulangan anonim akkauntlariga "admin" claim'ini qo'shadi
    (claim faqat ulanish paytida qo'yilardi — oldin ulanganlarda yo'q bo'lishi mumkin)."""
    for admin in ADMIN_IDS:
        for link in LINKS.where(filter=FieldFilter("tg", "==", admin)).stream():
            try:
                fb_auth.set_custom_user_claims(link.id, {"tg": admin, "admin": True})
            except Exception as e:  # noqa: BLE001
                log.info("Admin claim (%s): %s", link.id, e)


# ---------------- Weekly reminder ----------------
async def reminder_loop(bot: Bot):
    while True:
        try:
            await remind_trials(bot)
        except Exception:  # noqa: BLE001
            log.exception("Sinov darsi eslatmalarida xato")
        try:
            now = datetime.now(timezone.utc)
            q = CENTERS.where(filter=FieldFilter("approved", "==", True))
            docs = await asyncio.to_thread(lambda: list(q.stream()))
            for d in docs:
                c = as_dict(d)
                upd, last = c.get("updatedAt"), c.get("lastReminderAt")
                if isinstance(upd, datetime) and now - upd < REMIND_AFTER:
                    continue
                if isinstance(last, datetime) and now - last < REMIND_AFTER:
                    continue
                kb = InlineKeyboardMarkup(inline_keyboard=[
                    [btn("✅ Hammasi to‘g‘ri", "ok", d.id)],
                    [btn("✏️ Panelni ochish", "panel", d.id)],
                ])
                try:
                    await bot.send_message(
                        c["ownerTgId"],
                        f"👋 <b>{escape(c.get('name', ''))}</b>\n"
                        "Bo‘sh joylar va narxlar hali to‘g‘rimi?\n\n"
                        "Ma’lumot 14 kun yangilanmasa, xaritada «eskirgan bo‘lishi mumkin» belgisi chiqadi.",
                        reply_markup=kb,
                    )
                except Exception as e:  # noqa: BLE001
                    log.warning("Eslatma yuborilmadi (%s): %s", d.id, e)
                await asyncio.to_thread(d.reference.update, {"lastReminderAt": firestore.SERVER_TIMESTAMP})
        except Exception:  # noqa: BLE001
            log.exception("Eslatma siklida xato")
        await asyncio.sleep(REMIND_CHECK_EVERY)


# ---------------- Kuzatuvchilar qo'riqchisi ----------------
WATCH_CHECK_EVERY = 60  # soniya


async def supervise_watchers(watchers: dict, factories: dict):
    """Har daqiqada: o'chib qolgan Firestore kuzatuvchisini qayta ishga tushiradi.
    Qayta ulanganda o'tkazib yuborilgan hodisalar ham keladi (masalan, notified=false arizalar)."""
    while True:
        await asyncio.sleep(WATCH_CHECK_EVERY)
        for name, w in list(watchers.items()):
            try:
                alive = bool(getattr(w, "is_active", True))
            except Exception:  # noqa: BLE001
                alive = False
            if alive:
                ops.STATE.dead_watchers.discard(name)
                continue
            ops.STATE.watcher_restarts += 1
            ops.STATE.dead_watchers.add(name)
            log.warning("Kuzatuvchi to'xtagan: %s — qayta ishga tushiryapman", name)
            try:
                w.unsubscribe()
            except Exception:  # noqa: BLE001
                pass
            try:
                watchers[name] = await asyncio.to_thread(factories[name])
                ops.STATE.dead_watchers.discard(name)
                log.info("Kuzatuvchi tiklandi: %s", name)
            except Exception as e:  # noqa: BLE001
                log.warning("Kuzatuvchini tiklab bo'lmadi (%s): %s — keyingi tekshiruvda yana urinaman", name, e)


# ======================= Markazlar: tez qo'shish, egallash, QR, hisobot, to'lov =======================
CLAIM_REQS = db.collection("claimRequests")  # ilovadagi «Bu mening markazim»
CLAIM_CODES = db.collection("claimCodes")  # admin bergan bir martalik kodlar
BOT_REQS = db.collection("botRequests")  # ilovadan botga topshiriq (QR yuborish va h.k.)
CENTER_STATS = db.collection("centerStats")  # kunlik agregat: {cid}_{sana}: views, calls, routes, apps, accepted
DAILY_STATS = db.collection("dailyStats")  # {sana}: open, view (ilova) · apply, accept (bot) — admin voronkasi
SOURCE_STATS = db.collection("sourceStats")  # {src_kanal | c_markaz}: users (ilova) · apps (bot)
_DAILY_FIELD = {"apps": "apply", "accepted": "accept"}
BOT_USERNAME = "yaqindars_bot"  # main() da get_me() bilan yangilanadi


def center_link(cid: str) -> str:
    return f"https://t.me/{BOT_USERNAME}?startapp=c_{cid}"


def campaign_link(slug: str) -> str:
    return f"https://t.me/{BOT_USERNAME}?startapp=src_{slug}"


def clean_name(name) -> str:
    return str(name or "").replace("Namuna:", "").strip()


def bump_stat(cid: str, field: str, n: int = 1):
    """Kunlik hisoblagich (har hodisa alohida hujjat emas): centerStats/{cid}_{Toshkent sanasi}.{field} += n."""
    if not cid or "/" in cid:
        return
    date = local_date(datetime.now(timezone.utc))
    try:
        CENTER_STATS.document(f"{cid}_{date}").set({"centerId": cid, "date": date, field: firestore.Increment(n)}, merge=True)
        if field in _DAILY_FIELD:
            DAILY_STATS.document(date).set({"date": date, _DAILY_FIELD[field]: firestore.Increment(n)}, merge=True)
    except Exception as e:  # noqa: BLE001
        log.info("Statistika yozilmadi (%s.%s): %s", cid, field, e)


def bump_source(source, n: int = 1):
    """Ariza qaysi manbadan kelgan (src_flyer, c_<markaz>) — admin «Manbalar» jadvali uchun."""
    if not isinstance(source, str) or not SOURCE_RE.fullmatch(source):
        return
    try:
        SOURCE_STATS.document(source).set({"source": source, "apps": firestore.Increment(n)}, merge=True)
    except Exception as e:  # noqa: BLE001
        log.info("Manba statistikasi yozilmadi (%s): %s", source, e)


def owner_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🎓 Kabinetni ochish", web_app=WebAppInfo(url=OWNER_URL), style="primary")
    ]])


def pay_url(c: dict, cid: str) -> str:
    tariff = "VIP" if c.get("vip") or c.get("tariff") == "vip" else "Oddiy"
    price = tariff_price(c.get("kind"), "vip" if tariff == "VIP" else "oddiy")
    text = f"Assalomu alaykum! YaqinDars to‘lovi.\nMarkaz: {clean_name(c.get('name'))}\nTarif: {tariff} — {fmt_sum(price)}/oy\nMarkaz ID: {cid}"
    return f"https://t.me/{ADMIN_TG}?text={quote(text)}"


# ---------------- Admin: markazni tez qo'shish (/admin → «➕ Markaz qo‘shish») ----------------
class AdminAdd(StatesGroup):
    name = State()
    location = State()
    phone = State()
    subjects = State()
    price = State()


@router.callback_query(F.data == "aa:new")
async def admin_add_start(call: CallbackQuery, state: FSMContext):
    if not is_admin(call.from_user.id):
        return await call.answer()
    await state.clear()
    await state.set_state(AdminAdd.name)
    await call.message.answer("➕ <b>Markazni tez qo‘shish</b> (5 qadam)\n\n1/5. Markaz yoki repetitor nomi?\n\nBekor qilish: /cancel")
    await call.answer()


@router.message(AdminAdd.name, TEXT)
async def admin_add_name(message: Message, state: FSMContext):
    name = " ".join(message.text.split())[:100]
    if len(name) < 2:
        return await message.answer("Nom juda qisqa. Qaytadan yozing:")
    await state.update_data(name=name)
    await state.set_state(AdminAdd.location)
    kb = ReplyKeyboardMarkup(keyboard=[[KeyboardButton(text="📍 Hozirgi joylashuvim", request_location=True)]], resize_keyboard=True, one_time_keyboard=True)
    await message.answer(
        "2/5. <b>Xaritadagi joyi.</b>\n📎 → <b>Joylashuv</b> → pinni markaz ustiga surib yuboring.\n"
        "Yoki Google/Yandex xarita havolasini, yoki «40.3567, 71.2845» ko‘rinishida koordinata yozing.",
        reply_markup=kb,
    )


@router.message(AdminAdd.location, F.location | TEXT)
async def admin_add_location(message: Message, state: FSMContext):
    if message.location:
        lat, lng = message.location.latitude, message.location.longitude
    else:
        p = parse_latlng(message.text)
        if not p:
            return await message.answer("Koordinata topilmadi. Joylashuv yuboring yoki «40.3567, 71.2845» deb yozing.")
        lat, lng = p
    await state.update_data(lat=lat, lng=lng)
    await state.set_state(AdminAdd.phone)
    await message.answer("3/5. Markaz telefoni (masalan <code>+998 90 123 45 67</code>):", reply_markup=main_menu())


@router.message(AdminAdd.phone, F.contact | TEXT)
async def admin_add_phone(message: Message, state: FSMContext):
    phone = normalize_phone(message.contact.phone_number if message.contact else message.text)
    if not phone:
        return await message.answer("Raqam noto‘g‘ri. Masalan: +998 90 123 45 67")
    await state.update_data(phone=phone)
    await state.set_state(AdminAdd.subjects)
    await message.answer(
        "4/5. Fanlar (ixtiyoriy), vergul bilan: <i>Ingliz tili, Matematika</i>\n"
        f"Ro‘yxat: {', '.join(SUBJECTS)}\n\nO‘tkazib yuborish: <b>-</b>"
    )


@router.message(AdminAdd.subjects, TEXT)
async def admin_add_subjects(message: Message, state: FSMContext):
    await state.update_data(subjects=parse_subjects(message.text, SUBJECTS))
    await state.set_state(AdminAdd.price)
    await message.answer("5/5. Oylik narx, so‘m (ixtiyoriy): <i>250000</i>\nO‘tkazib yuborish: <b>-</b>")


@router.message(AdminAdd.price, TEXT)
async def admin_add_price(message: Message, state: FSMContext):
    t = message.text.strip()
    price = 0
    if t not in ("-", "—"):
        price = parse_int(t, PRICE_MIN, PRICE_MAX)
        if price is None:
            return await message.answer(f"Narx {fmt_sum(PRICE_MIN)} – {fmt_sum(PRICE_MAX)} oralig‘ida bo‘lsin, yoki «-».")
    d = await state.get_data()
    await state.clear()
    subjects = d.get("subjects") or ["Boshqa"]
    doc = {
        "name": d["name"],
        "address": "Xaritada ko‘rsatilgan",
        "lat": d["lat"],
        "lng": d["lng"],
        "phone": d["phone"],
        "amenities": [],
        "description": "",
        "kind": "center",
        # Kun/vaqt noma'lum, bo'sh joy 0 — egasi egallagach to'ldiradi
        "groups": [{"subject": s, "days": [], "time": "", "price": price, "freeSeats": 0} for s in subjects],
        "teachers": [],
        "vip": False,
        "rating": None,
        "approved": True,
        "status": "approved",
        "tariff": None,
        "ownerTgId": None,
        "ownerUsername": None,
        "claimed": False,
        "source": "admin",
        "addedBy": message.from_user.id,
        "createdAt": firestore.SERVER_TIMESTAMP,
        "updatedAt": firestore.SERVER_TIMESTAMP,
        "lastReminderAt": None,
    }
    _, ref = await asyncio.to_thread(CENTERS.add, doc)
    log.info("Admin %s markaz qo'shdi: %s (%s)", message.from_user.id, ref.id, d["name"])
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [btn("🔑 Egasi uchun kod", "acc", ref.id), btn("📲 QR", "aqr", ref.id)],
        [InlineKeyboardButton(text="➕ Yana qo‘shish", callback_data="aa:new")],
    ])
    await message.answer(
        f"✅ <b>{escape(d['name'])}</b> xaritaga qo‘shildi (belgisi: «Ma’lumot tasdiqlanmagan»).\n"
        f"📞 {d['phone']} · 📚 {escape(', '.join(subjects))}" + (f" · {fmt_sum(price)}" if price else "") + "\n"
        f"ID: <code>{ref.id}</code>\n\n"
        "Egasi ilovada «Bu mening markazim» ni bosishi yoki siz bergan kod bilan /claim qilishi mumkin.",
        reply_markup=kb,
    )


async def notify_admins_ownerless_app(bot: Bot, cid: str, c: dict, data: dict):
    user = f"\n💬 @{escape(str(data['tgUsername']))}" if data.get("tgUsername") else ""
    text = (
        "🔔 <b>Ariza egasi yo‘q markazga</b>\n\n"
        f"🏫 {escape(clean_name(c.get('name')))}\n"
        f"☎️ Markaz telefoni: <b>{escape(str(c.get('phone', '—')))}</b>\n\n"
        f"📚 {escape(str(data.get('group', '')))}\n"
        f"👤 {escape(str(data.get('name', '')))}\n"
        f"📞 {escape(str(data.get('phone', '')))}{user}\n\n"
        "Markazga qo‘ng‘iroq qilib arizani yetkazing va YaqinDars’ga ulanishni taklif qiling."
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[[btn("🔑 Egasi uchun kod", "acc", cid)]])
    await notify_admins(bot, text, reply_markup=kb)


# ---------------- Egallash (claim): kod va ilovadagi so'rov ----------------
def attach_patch(center: dict, tg_id: int, username, via: str) -> dict:
    return {
        "ownerTgId": tg_id,
        "ownerUsername": username,
        "claimed": True,
        "claimedAt": firestore.SERVER_TIMESTAMP,  # bepul 15 kun shundan hisoblanadi
        "claimedVia": via,
        "tariff": center.get("tariff") or "oddiy",
        "updatedAt": firestore.SERVER_TIMESTAMP,
    }


def create_claim_code(cid: str, admin_id: int) -> str:
    now = datetime.now(timezone.utc)
    for _ in range(6):
        code = make_claim_code()
        try:
            CLAIM_CODES.document(code).create({"centerId": cid, "createdBy": admin_id, "createdAt": now,
                                               "expiresAt": now + CODE_TTL, "usedBy": None})
            return code
        except AlreadyExists:
            continue
    raise RuntimeError("Kod yaratib bo'lmadi")


async def send_claim_code(message: Message, cid: str, admin_id: int):
    center = await get_center(cid)
    if not center:
        return await message.answer("Markaz topilmadi.")
    c = as_dict(center)
    if is_claimed(c):
        return await message.answer(f"«{escape(clean_name(c.get('name')))}» ning egasi allaqachon bor.")
    code = await asyncio.to_thread(create_claim_code, cid, admin_id)
    await message.answer(
        f"🔑 <b>{escape(clean_name(c.get('name')))}</b> uchun kod: <code>{code}</code>\n"
        f"7 kun, bir marta amal qiladi.\n\nEgasiga yuboring:\n"
        f"«@{BOT_USERNAME} botiga <code>/claim {code}</code> deb yozing — markaz kabinetingizga ulanadi, {TRIAL_DAYS} kun bepul.»"
    )


@router.message(Command("claimcode"))
async def claimcode_cmd(message: Message, command: CommandObject):
    if not is_admin(message.from_user.id):
        return
    cid = (command.args or "").strip()
    if not cid or "/" in cid:
        return await message.answer("Foydalanish: <code>/claimcode markazId</code> (ID markaz qo‘shilganda yoki admin panelda ko‘rinadi)")
    await send_claim_code(message, cid, message.from_user.id)


@router.callback_query(F.data.startswith("acc:"))
async def claimcode_btn(call: CallbackQuery):
    if not is_admin(call.from_user.id):
        return await call.answer()
    await call.answer()
    await send_claim_code(call.message, call.data.split(":", 1)[1], call.from_user.id)


@firestore.transactional
def _claim_code_txn(transaction, code_ref, tg_id: int, username):
    code_snap = code_ref.get(transaction=transaction)
    code = code_snap.to_dict() if code_snap.exists else None
    center_ref = CENTERS.document(str(code["centerId"])) if code and code.get("centerId") else None
    center_snap = center_ref.get(transaction=transaction) if center_ref else None
    center = center_snap.to_dict() if center_snap is not None and center_snap.exists else None
    err = claim_code_error(code, center, datetime.now(timezone.utc))
    if err:
        return err, None
    transaction.update(center_ref, attach_patch(center, tg_id, username, "code"))
    transaction.update(code_ref, {"usedBy": tg_id, "usedAt": firestore.SERVER_TIMESTAMP})
    return None, (center_ref.id, center)


@router.message(Command("claim"))
async def claim_cmd(message: Message, command: CommandObject, bot: Bot):
    code = normalize_code(command.args or "")
    if not code:
        return await message.answer("Kodni yozing, masalan: <code>/claim ABC123</code>\nKodni admin beradi: @" + ADMIN_TG)
    user = message.from_user
    err, res = await asyncio.to_thread(lambda: _claim_code_txn(db.transaction(), CLAIM_CODES.document(code), user.id, user.username))
    if err:
        return await message.answer(f"⚠️ {err}")
    cid, c = res
    name = escape(clean_name(c.get("name")))
    await message.answer(
        f"✅ <b>{name}</b> endi sizniki!\n🎁 {TRIAL_DAYS} kun bepul. Bo‘sh joylar, guruhlar va arizalarni kabinetda boshqaring.\n"
        "Markaz QR kodi: /qr",
        reply_markup=owner_kb(),
    )
    await notify_admins(bot, f"🔑 <b>{name}</b> kod orqali egallandi: {escape(user.full_name)}" + (f" (@{user.username})" if user.username else "") + f"\nID: <code>{cid}</code>")


async def process_claim_request(bot: Bot, ref):
    req = await claim_if(ref, lambda d: d.get("status") == "pending" and not d.get("notified"), {"notified": True})
    if not req:
        return
    center = await get_center(str(req.get("centerId", "")))
    c = as_dict(center) if center else {}
    who = escape(str(req.get("name") or "")) + (f" @{escape(str(req['username']))}" if req.get("username") else "") + f" (<code>{req.get('tgId')}</code>)"
    text = (
        "🙋 <b>«Bu mening markazim» so‘rovi</b>\n\n"
        f"🏫 {escape(clean_name(c.get('name') or req.get('centerName')))}\n"
        f"☎️ Markaz telefoni: <b>{escape(str(c.get('phone', '—')))}</b>\n"
        f"👤 {who}\n\n"
        "Tasdiqlashdan oldin markaz telefoniga qo‘ng‘iroq qilib, egasi ekanini aniqlang."
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Tasdiqlash", callback_data=f"cr:ok:{ref.id}", style="success"),
        InlineKeyboardButton(text="❌ Rad etish", callback_data=f"cr:no:{ref.id}", style="danger"),
    ]])
    await notify_admins(bot, text, reply_markup=kb)


@firestore.transactional
def _claim_req_txn(transaction, req_ref, approve: bool):
    req_snap = req_ref.get(transaction=transaction)
    req = req_snap.to_dict() if req_snap.exists else None
    if not req or req.get("status") != "pending":
        return "So‘rov allaqachon ko‘rib chiqilgan.", None
    center_ref = CENTERS.document(str(req.get("centerId")))
    center_snap = center_ref.get(transaction=transaction)
    center = center_snap.to_dict() if center_snap.exists else None
    if approve:
        if not center:
            return "Markaz topilmadi.", None
        if is_claimed(center):
            transaction.update(req_ref, {"status": "rejected", "decidedAt": firestore.SERVER_TIMESTAMP})
            return "Bu markazning egasi allaqachon bor — so‘rov rad etildi.", None
        transaction.update(center_ref, attach_patch(center, int(req["tgId"]), req.get("username"), "request"))
    transaction.update(req_ref, {"status": "approved" if approve else "rejected", "decidedAt": firestore.SERVER_TIMESTAMP})
    return None, (req, center or {})


@router.callback_query(F.data.startswith("cr:"))
async def claim_request_decide(call: CallbackQuery, bot: Bot):
    if not is_admin(call.from_user.id):
        return await call.answer()
    _, action, rid = call.data.split(":", 2)
    approve = action == "ok"
    err, res = await asyncio.to_thread(lambda: _claim_req_txn(db.transaction(), CLAIM_REQS.document(rid), approve))
    if err:
        await call.answer(err, show_alert=True)
        try:
            await call.message.edit_reply_markup(reply_markup=None)
        except TelegramBadRequest:
            pass
        return
    req, c = res
    name = escape(clean_name(c.get("name") or req.get("centerName")))
    try:
        await call.message.edit_text(call.message.html_text + ("\n\n<b>✅ Tasdiqlandi</b>" if approve else "\n\n<b>❌ Rad etildi</b>"))
    except (TelegramBadRequest, AttributeError):
        pass
    await call.answer("Tasdiqlandi" if approve else "Rad etildi")
    tg_id = req.get("tgId")
    if approve:
        try:
            await bot.send_message(tg_id, f"✅ <b>{name}</b> sizga biriktirildi!\n🎁 {TRIAL_DAYS} kun bepul. Ma’lumotlarni kabinetda yangilang — "
                                          "«Ma’lumot tasdiqlanmagan» belgisi o‘rniga markazingiz to‘liq ko‘rinadi.\nQR kod: /qr",
                                   reply_markup=owner_kb())
        except Exception as e:  # noqa: BLE001
            log.info("Egaga yuborilmadi (%s): %s", tg_id, e)
    else:
        await notify_user(bot, tg_id, f"«{name}» bo‘yicha so‘rovingiz tasdiqlanmadi. Savol bo‘lsa: @{ADMIN_TG}", open_app=False)


def start_claim_watcher(bot: Bot, loop: asyncio.AbstractEventLoop):
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name == "ADDED":
                asyncio.run_coroutine_threadsafe(process_claim_request(bot, ch.document.reference), loop)

    return CLAIM_REQS.where(filter=FieldFilter("status", "==", "pending")).on_snapshot(on_snapshot)


# ---------------- QR va havolalar ----------------
async def send_center_qr(bot: Bot, chat_id: int, cid: str, c: dict):
    name = clean_name(c.get("name"))
    link = center_link(cid)
    png = await asyncio.to_thread(make_poster, name, link, BOT_USERNAME)
    await bot.send_document(
        chat_id,
        BufferedInputFile(png, filename=f"yaqindars-qr-{cid[:8]}.png"),
        caption=(
            f"📲 <b>{escape(name)}</b> — QR kod (1200×1500, chop etishga tayyor)\n\n"
            f"🔗 {link}\n\n"
            "Eshikka, e’lonlarga, Instagram’ga joylang: skanerlagan ota-ona to‘g‘ridan-to‘g‘ri markazingiz sahifasiga tushadi."
        ),
    )


@router.message(Command("qr"))
async def qr_cmd(message: Message, bot: Bot):
    centers = await owner_centers(message.from_user.id)
    if not centers:
        return await message.answer("Sizda hali markaz yo‘q. Qo‘shish: /markaz")
    for snap in centers[:5]:
        await send_center_qr(bot, message.chat.id, snap.id, as_dict(snap))


@router.callback_query(F.data.startswith("aqr:"))
async def admin_qr_btn(call: CallbackQuery, bot: Bot):
    if not is_admin(call.from_user.id):
        return await call.answer()
    await call.answer()
    center = await get_center(call.data.split(":", 1)[1])
    if center:
        await send_center_qr(bot, call.message.chat.id, center.id, as_dict(center))


@router.message(Command("link"))
async def link_cmd(message: Message, command: CommandObject, bot: Bot):
    if not is_admin(message.from_user.id):
        return
    slug = campaign_slug(command.args or "")
    if not slug:
        lines = "\n".join(f"• <code>/link {k}</code>" for k in CAMPAIGNS)
        return await message.answer(
            "🔗 <b>Kampaniya havolalari</b> — kim qayerdan kelganini admin paneldagi «Manbalar» jadvali ko‘rsatadi.\n\n"
            f"{lines}\n\nO‘zingiznikini ham yozish mumkin (lotin harflari, raqam, _): <code>/link bozor_banner</code>"
        )
    link = campaign_link(slug)
    png = await asyncio.to_thread(make_poster, "Rishtondagi o‘quv markazlari va repetitorlar", link, BOT_USERNAME,
                                  "Bo‘sh joylar · narxlar · bepul sinov darsi")
    await bot.send_document(message.chat.id, BufferedInputFile(png, filename=f"yaqindars-{slug}.png"),
                            caption=f"🔗 <b>{slug}</b> kampaniyasi:\n{link}\n\nPoster — chop etish uchun.")


async def process_bot_request(bot: Bot, ref):
    req = await claim_if(ref, lambda d: d.get("status") == "pending", {"status": "processing"})
    if not req:
        return
    status = "done"
    try:
        if req.get("type") == "remindStale":
            if not is_admin(int(req.get("tgId") or 0)):
                status = "error"
            else:
                n = await remind_stale_centers(bot)
                await notify_admins(bot, f"🔔 «Yangilanmagan markazlar»: {n} ta egaga eslatma yuborildi.")
        elif req.get("type") == "qr":
            center = await get_center(str(req.get("centerId", "")))
            c = as_dict(center) if center else {}
            if not center or c.get("ownerTgId") != req.get("tgId"):
                status = "error"
            else:
                await send_center_qr(bot, req["tgId"], center.id, c)
        else:
            status = "error"
    except Exception:  # noqa: BLE001
        log.exception("Bot so'rovi %s xatosi", ref.id)
        status = "error"
    await asyncio.to_thread(ref.update, {"status": status, "doneAt": firestore.SERVER_TIMESTAMP})


def start_botreq_watcher(bot: Bot, loop: asyncio.AbstractEventLoop):
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name == "ADDED":
                asyncio.run_coroutine_threadsafe(process_bot_request(bot, ch.document.reference), loop)

    return BOT_REQS.where(filter=FieldFilter("status", "==", "pending")).on_snapshot(on_snapshot)


STALE_AFTER = timedelta(days=14)


async def remind_stale_centers(bot: Bot) -> int:
    """14+ kun yangilanmagan (egasi bor, ko'rinadigan) markazlarga eslatma. Yuborilganlar soni."""
    now = datetime.now(timezone.utc)
    snaps = await asyncio.to_thread(lambda: list(CENTERS.where(filter=FieldFilter("approved", "==", True)).stream()))
    sent = 0
    for snap in snaps:
        c = as_dict(snap)
        upd = c.get("updatedAt")
        if not c.get("ownerTgId") or c.get("hidden") or (isinstance(upd, datetime) and now - upd < STALE_AFTER):
            continue
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [btn("✅ Hammasi to‘g‘ri", "ok", snap.id)],
            [InlineKeyboardButton(text="✏️ Kabinetda yangilash", web_app=WebAppInfo(url=OWNER_URL))],
        ])
        try:
            await bot.send_message(
                c["ownerTgId"],
                f"👋 <b>{escape(clean_name(c.get('name')))}</b>\nMa’lumotlaringiz 14 kundan beri yangilanmagan.\n"
                "Bo‘sh joylar va narxlar hali to‘g‘rimi? Yangi ma’lumotli markazlar ota-onalarga yuqoriroq ko‘rinadi.",
                reply_markup=kb,
            )
            sent += 1
            await asyncio.to_thread(snap.reference.update, {"lastReminderAt": firestore.SERVER_TIMESTAMP})
        except Exception as e:  # noqa: BLE001
            log.info("Eslatma yuborilmadi (%s): %s", snap.id, e)
        await asyncio.sleep(0.05)
    return sent


# ---------------- Haftalik hisobot (dushanba 09:00) ----------------
def center_week_stats(cid: str, now: datetime) -> tuple[dict, dict]:
    cur_d, prev_d = week_dates(now), week_dates(now, 1)
    refs = [CENTER_STATS.document(f"{cid}_{d}") for d in cur_d + prev_d]
    got = {s.id: (s.to_dict() or {}) for s in db.get_all(refs) if s.exists}
    cur = sum_stats([got[f"{cid}_{d}"] for d in cur_d if f"{cid}_{d}" in got])
    prev = sum_stats([got[f"{cid}_{d}"] for d in prev_d if f"{cid}_{d}" in got])
    return cur, prev


def weekly_report_text(c: dict, cur: dict, prev: dict, now: datetime) -> str:
    days = week_dates(now)
    period = f"{days[0][8:]}.{days[0][5:7]} – {days[-1][8:]}.{days[-1][5:7]}"
    rows = [("👁", "Ko‘rishlar", "views"), ("📞", "Qo‘ng‘iroq bosildi", "calls"), ("🧭", "Yo‘l bosildi", "routes"),
            ("📝", "Arizalar", "apps"), ("✅", "Qabul qilingan", "accepted")]
    lines = [f"{e} {label}: <b>{cur[k]}</b> <i>({fmt_change(cur[k], prev[k])})</i>" for e, label, k in rows]
    return (f"📊 <b>Haftalik hisobot</b> · {escape(clean_name(c.get('name')))}\n{period}\n\n" + "\n".join(lines)
            + f"\n\n💡 {weekly_tip(cur, c, now)}")


async def job_weekly_report(bot: Bot):
    now = datetime.now(timezone.utc)
    snaps = await asyncio.to_thread(lambda: list(CENTERS.where(filter=FieldFilter("approved", "==", True)).stream()))
    sent = 0
    for snap in snaps:
        c = as_dict(snap)
        if not c.get("ownerTgId") or c.get("hidden"):
            continue
        try:
            cur, prev = await asyncio.to_thread(center_week_stats, snap.id, now)
            await bot.send_message(c["ownerTgId"], weekly_report_text(c, cur, prev, now), reply_markup=owner_kb())
            sent += 1
        except Exception as e:  # noqa: BLE001
            log.info("Haftalik hisobot yuborilmadi (%s): %s", snap.id, e)
        await asyncio.sleep(0.05)
    log.info("Haftalik hisobot: %s ta markazga yuborildi", sent)


# ---------------- To'lov eslatmalari va muddati o'tganlarni yashirish (har kuni 10:00) ----------------
async def job_billing(bot: Bot):
    now = datetime.now(timezone.utc)
    snaps = await asyncio.to_thread(lambda: list(CENTERS.where(filter=FieldFilter("approved", "==", True)).stream()))
    for snap in snaps:
        c = as_dict(snap)
        act = billing_action(c, now)
        if not act:
            continue
        kind, n = act
        name = escape(clean_name(c.get("name")))
        owner = c.get("ownerTgId")
        pay_kb = InlineKeyboardMarkup(inline_keyboard=[[ibtn("💳 To‘lash — admin orqali", pay_url(c, snap.id), "success")]])
        try:
            if kind == "remind":
                await asyncio.to_thread(snap.reference.update, {"billingReminded": remind_key(c, n)})
                when = "ertaga" if n == 1 else f"{n} kundan keyin"
                await bot.send_message(owner, f"⏰ <b>{name}</b>: obuna muddati {when} tugaydi.\n"
                                              "Xaritada qolish uchun to‘lovni admin orqali qiling.", reply_markup=pay_kb)
            elif kind == "hide":
                await asyncio.to_thread(snap.reference.update, {"hidden": True, "hiddenAt": firestore.SERVER_TIMESTAMP})
                await bot.send_message(owner, f"⚠️ <b>{name}</b> to‘lov muddati {n} kun oldin tugagani uchun xaritadan vaqtincha yashirildi.\n"
                                              "Ma’lumotlaringiz o‘chirilmagan — to‘lovdan keyin darhol qaytadi.", reply_markup=pay_kb)
                await notify_admins(bot, f"🙈 <b>{name}</b> xaritadan yashirildi: to‘lov {n} kun kechikdi.\nID: <code>{snap.id}</code>")
            elif kind == "unhide":
                await asyncio.to_thread(snap.reference.update, {"hidden": False})
                await bot.send_message(owner, f"✅ <b>{name}</b> yana xaritada ko‘rinmoqda. Rahmat!")
        except Exception as e:  # noqa: BLE001
            log.info("To'lov eslatmasi (%s, %s): %s", snap.id, kind, e)


# ======================= Ota-onalar: kuzatuvlar, baholar, inline rejim =======================
WATCHES = db.collection("watches")  # «Shunday joy ochilsa xabar ber»
WATCH_DAILY = db.collection("watchDaily")  # {tg}_{sana}: count — kuniga 3 tadan oshmasin
RATINGS = db.collection("ratings")  # ID = ariza ID (bitta arizaga bitta baho)


@firestore.transactional
def _watch_claim_txn(transaction, w_ref, daily_ref, key: str) -> bool:
    w_snap = w_ref.get(transaction=transaction)
    d_snap = daily_ref.get(transaction=transaction)
    if not w_snap.exists:
        return False
    w = w_snap.to_dict() or {}
    count = int((d_snap.to_dict() or {}).get("count", 0)) if d_snap.exists else 0
    if not watch_should_send(w, key, count):
        return False
    sent = (list(w.get("sent") or []) + [key])[-WATCH_SENT_KEEP:]
    transaction.update(w_ref, {"sent": sent, "lastSentAt": firestore.SERVER_TIMESTAMP})
    transaction.set(daily_ref, {"count": count + 1, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
    return True


async def notify_watches(bot: Bot, cid: str, gi: int, center: dict):
    """Guruhda bo'sh joy paydo bo'ldi — mos saqlangan qidiruvlar egalariga xabar."""
    if center.get("hidden"):
        return
    try:
        g = (center.get("groups") or [])[gi]
        docs = await asyncio.to_thread(lambda: list(WATCHES.where(filter=FieldFilter("active", "==", True)).stream()))
        date = local_date(datetime.now(timezone.utc))
        for d in docs:
            w = as_dict(d)
            uid = w.get("userTgId")
            if not isinstance(uid, int) or not watch_matches(w, center, g):
                continue
            daily = WATCH_DAILY.document(f"{uid}_{date}")
            ok = await asyncio.to_thread(lambda: _watch_claim_txn(db.transaction(), d.reference, daily, watch_key(cid, gi)))
            if not ok:
                continue
            price = f" · {fmt_sum(g['price'])}" if (g.get("price") or 0) > 0 else ""
            kb = InlineKeyboardMarkup(inline_keyboard=[[ibtn("📱 Markazni ochish", center_link(cid), "primary")]])
            try:
                await bot.send_message(
                    uid,
                    f"🔔 <b>Siz kutgan joy ochildi!</b>\n\n🏫 {escape(clean_name(center.get('name')))}\n"
                    f"📚 {escape(str(g.get('subject', '')))}{price}\n🪑 Bo‘sh joy: <b>{int(g.get('freeSeats') or 0)}</b>\n\n"
                    f"<i>Kuzatuv: {escape(watch_title(w))}</i>\nO‘chirish: ilova → Profil → Kuzatuvlarim",
                    reply_markup=kb,
                )
            except Exception as e:  # noqa: BLE001
                log.info("Kuzatuv xabari yuborilmadi (%s): %s", uid, e)
    except Exception:  # noqa: BLE001
        log.exception("Kuzatuvlar (%s) xabarlarida xato", cid)


# ---------------- Sinov darsidan 3 soat keyin: «Dars yoqdimi?» ----------------
RATING_CHECK_EVERY = 10 * 60  # soniya


def rating_kb(app_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=f"{n} ⭐", callback_data=f"rt:{app_id}:{n}") for n in range(1, 6)
    ]])


async def ask_ratings(bot: Bot):
    now = datetime.now(timezone.utc)
    q = APPS.where(filter=FieldFilter("status", "==", "accepted"))
    for d in await asyncio.to_thread(lambda: list(q.stream())):
        a = as_dict(d)
        if not rating_due(a, now) or not isinstance(a.get("tgUserId"), int):
            continue
        if not await claim_if(d.reference, lambda x: not x.get("ratingAsked"), {"ratingAsked": True}):
            continue
        try:
            await bot.send_message(
                a["tgUserId"],
                f"🎓 <b>{escape(clean_name(a.get('centerName')))}</b> — sinov darsi qanday o‘tdi?\n\n"
                "<b>Dars yoqdimi?</b> Baholang: 1 — yoqmadi, 5 — juda yoqdi.\nBahoyingiz boshqa ota-onalarga yordam beradi.",
                reply_markup=rating_kb(d.id),
            )
        except Exception as e:  # noqa: BLE001
            log.info("Baho so'rovi yuborilmadi (%s): %s", d.id, e)


async def rating_loop(bot: Bot):
    while True:
        try:
            await ask_ratings(bot)
        except Exception:  # noqa: BLE001
            log.exception("Baho so'rovlarida xato")
        await asyncio.sleep(RATING_CHECK_EVERY)


@firestore.transactional
def _rate_txn(transaction, app_ref, user_id: int, stars: int):
    app_snap = app_ref.get(transaction=transaction)
    app = app_snap.to_dict() if app_snap.exists else None
    r_ref = RATINGS.document(app_ref.id)
    r_snap = r_ref.get(transaction=transaction)
    err = rating_error(app, user_id, r_snap.exists)
    if err:
        return err, None
    c_ref = CENTERS.document(str(app.get("centerId")))
    if not c_ref.get(transaction=transaction).exists:
        return "Markaz topilmadi.", None
    transaction.set(r_ref, {"centerId": app.get("centerId"), "centerName": app.get("centerName", ""), "userTgId": user_id,
                            "stars": stars, "comment": "", "createdAt": firestore.SERVER_TIMESTAMP})
    transaction.update(c_ref, {"ratingSum": firestore.Increment(stars), "ratingCount": firestore.Increment(1)})
    transaction.update(app_ref, {"rated": True})
    return None, app


class RateComment(StatesGroup):
    text = State()


@router.callback_query(F.data.startswith("rt:"))
async def on_rate(call: CallbackQuery):
    try:
        _, app_id, n = call.data.split(":")
        stars = int(n)
        assert 1 <= stars <= 5 and "/" not in app_id
    except (ValueError, AssertionError):
        return await call.answer()
    err, app = await asyncio.to_thread(lambda: _rate_txn(db.transaction(), APPS.document(app_id), call.from_user.id, stars))
    if err:
        await call.answer(err, show_alert=True)
        try:
            await call.message.edit_reply_markup(reply_markup=None)
        except TelegramBadRequest:
            pass
        return
    await call.answer("Rahmat!")
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✍️ Izoh yozish (ixtiyoriy)", callback_data=f"rc:{app_id}")]])
    try:
        await call.message.edit_text(
            f"🎓 <b>{escape(clean_name(app.get('centerName')))}</b>\nBahoyingiz: {'⭐' * stars}\n\nRahmat! Xohlasangiz, qisqa izoh qoldiring.",
            reply_markup=kb,
        )
    except TelegramBadRequest:
        pass


@router.callback_query(F.data.startswith("rc:"))
async def rate_comment_start(call: CallbackQuery, state: FSMContext):
    app_id = call.data.split(":", 1)[1]
    snap = await asyncio.to_thread(RATINGS.document(app_id).get) if "/" not in app_id else None
    if not snap or not snap.exists or as_dict(snap).get("userTgId") != call.from_user.id:
        return await call.answer("Baho topilmadi.", show_alert=True)
    await state.set_state(RateComment.text)
    await state.update_data(rate_app=app_id)
    await call.message.answer("✍️ Izohingizni yozing (300 belgigacha). Bekor qilish: /cancel")
    await call.answer()


@router.message(RateComment.text, TEXT)
async def rate_comment_save(message: Message, state: FSMContext):
    d = await state.get_data()
    await state.clear()
    ref = RATINGS.document(str(d.get("rate_app", "")))
    snap = await asyncio.to_thread(ref.get)
    if not snap.exists or as_dict(snap).get("userTgId") != message.from_user.id:
        return await message.answer("Baho topilmadi.", reply_markup=main_menu())
    await asyncio.to_thread(ref.update, {"comment": " ".join(message.text.split())[:300]})
    await message.answer("✅ Izohingiz saqlandi. Rahmat!", reply_markup=main_menu())


# ---------------- Inline rejim: @yaqindars_bot ingliz ----------------
_inline_cache: dict = {"at": 0.0, "items": []}
INLINE_TTL = 300  # soniya


async def inline_centers() -> list[dict]:
    if time.time() - _inline_cache["at"] < INLINE_TTL:
        return _inline_cache["items"]
    snaps = await asyncio.to_thread(lambda: list(CENTERS.where(filter=FieldFilter("approved", "==", True)).stream()))
    items = []
    for s in snaps:
        c = as_dict(s)
        if c.get("hidden"):
            continue
        items.append({"id": s.id, "name": clean_name(c.get("name")), "groups": c.get("groups") or [], "vip": bool(c.get("vip")),
                      "photoUrl": c.get("photoUrl"), "address": c.get("address", ""),
                      "rating": display_rating(c.get("ratingSum"), c.get("ratingCount"))})
    _inline_cache.update(at=time.time(), items=items)
    return items


def inline_result(c: dict) -> InlineQueryResultArticle:
    groups = c["groups"]
    free = sum(int(g.get("freeSeats") or 0) for g in groups)
    prices = [g.get("price") or 0 for g in groups if (g.get("price") or 0) > 0]
    subjects = ", ".join(dict.fromkeys(str(g.get("subject", "")) for g in groups if g.get("subject")))
    price = f"{fmt_sum(min(prices))} dan" if prices else "narxini so‘rang"
    seats = f"🪑 {free} bo‘sh joy" if free else "joy hozircha yo‘q"
    rating = f" · ⭐ {c['rating']}" if c.get("rating") else ""
    thumb = c["photoUrl"] if str(c.get("photoUrl") or "").startswith("https://") else urljoin(WEBAPP_URL.split("?")[0], "icon-192.png")
    text = (f"🏫 <b>{escape(c['name'])}</b>{' 👑' if c.get('vip') else ''}\n📚 {escape(subjects or '—')}\n"
            f"{seats} · 💰 {price}{rating}\n📍 {escape(str(c.get('address') or ''))}\n\nYaqinDars — bepul sinov darsiga yoziling 👇")
    return InlineQueryResultArticle(
        id=c["id"][:64],
        title=c["name"] + (" 👑" if c.get("vip") else ""),
        description=f"{subjects or '—'}\n{seats} · {price}",
        thumbnail_url=thumb,
        input_message_content=InputTextMessageContent(message_text=text, parse_mode=ParseMode.HTML),
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="📱 Ochish", url=center_link(c["id"]))]]),
    )


@router.inline_query()
async def on_inline(query: InlineQuery):
    try:
        found = inline_search(await inline_centers(), query.query, 20)
        await query.answer([inline_result(c) for c in found], cache_time=60, is_personal=False)
    except Exception:  # noqa: BLE001
        log.exception("Inline so'rov xatosi")


# ======================= Ishonch: «Ma'lumot noto'g'ri» shikoyatlari =======================
REPORTS = db.collection("reports")
REPORT_REASONS = {
    "price": "Narx noto‘g‘ri",
    "seats": "Bo‘sh joy haqidagi ma’lumot noto‘g‘ri",
    "contact": "Manzil yoki telefon noto‘g‘ri",
    "closed": "Markaz yopilgan / ishlamaydi",
    "other": "Boshqa",
}


async def process_report(bot: Bot, ref):
    rep = await claim_if(ref, lambda d: d.get("status") == "new" and not d.get("notified"), {"notified": True})
    if not rep:
        return
    center = await get_center(str(rep.get("centerId", "")))
    c = as_dict(center) if center else {}
    owner = c.get("ownerUsername")
    owner_line = f"@{escape(str(owner))}" if owner else ("egasi yo‘q" if not c.get("ownerTgId") else f"<code>{c.get('ownerTgId')}</code>")
    comment = f"\n💬 «{escape(str(rep.get('comment')))}»" if rep.get("comment") else ""
    text = (
        "⚠️ <b>Ma’lumot noto‘g‘ri — shikoyat</b>\n\n"
        f"🏫 {escape(clean_name(c.get('name') or rep.get('centerName')))}\n"
        f"❗ {escape(REPORT_REASONS.get(str(rep.get('reason')), 'Boshqa'))}{comment}\n\n"
        f"☎️ Markaz: {escape(str(c.get('phone', '—')))} · egasi: {owner_line}\n"
        f"👤 Yuborgan: <code>{rep.get('tgId')}</code>\nID: <code>{rep.get('centerId')}</code>"
    )
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ Ko‘rib chiqildi", callback_data=f"rv:{ref.id}", style="success")]])
    await notify_admins(bot, text, reply_markup=kb)


@router.callback_query(F.data.startswith("rv:"))
async def report_reviewed(call: CallbackQuery, bot: Bot):
    if not is_admin(call.from_user.id):
        return await call.answer()
    rid = call.data.split(":", 1)[1]
    if "/" in rid:
        return await call.answer()
    rep = await claim_if(REPORTS.document(rid), lambda d: d.get("status") == "new", {"status": "reviewed", "reviewedAt": firestore.SERVER_TIMESTAMP})
    try:
        await call.message.edit_text(call.message.html_text + "\n\n<b>✅ Ko‘rib chiqildi</b>")
    except (TelegramBadRequest, AttributeError):
        pass
    await call.answer("Belgilandi")
    if rep:
        await notify_user(bot, rep.get("tgId"), f"✅ «{escape(clean_name(rep.get('centerName')))}» haqidagi xabaringiz ko‘rib chiqildi. Rahmat!", open_app=False)


def start_report_watcher(bot: Bot, loop: asyncio.AbstractEventLoop):
    def on_snapshot(_docs, changes, _read_time):
        for ch in changes:
            if ch.type.name == "ADDED":
                asyncio.run_coroutine_threadsafe(process_report(bot, ch.document.reference), loop)

    return REPORTS.where(filter=FieldFilter("status", "==", "new")).on_snapshot(on_snapshot)


# ---------------- Adminlarga xabar ----------------
async def notify_admins(bot: Bot, text: str, **kw):
    for admin in ADMIN_IDS:
        try:
            await bot.send_message(admin, text, **kw)
        except Exception as e:  # noqa: BLE001
            log.info("Adminga (%s) yuborilmadi: %s", admin, e)


# ---------------- Rejalashtiruvchi (Toshkent vaqti, system/schedule'da oxirgi bajarilish sanasi) ----------------
SCHEDULE = db.collection("system").document("schedule")
SCHEDULE_CHECK_EVERY = 60  # soniya


async def job_backup(bot: Bot):
    await ops.send_backup(db, bot, sorted(ADMIN_IDS), "kunlik")


# (nom, tekshiruvchi) — tekshiruvchi(now, oxirgi_sana) -> bool
SCHEDULED_JOBS = [
    ("backup", lambda now, last: due_daily(now, 3, 0, last), job_backup),
    ("billing", lambda now, last: due_daily(now, 10, 0, last), job_billing),
    ("weeklyReport", lambda now, last: due_weekly(now, 0, 9, 0, last), job_weekly_report),
]


async def scheduler_loop(bot: Bot):
    while True:
        try:
            now = datetime.now(timezone.utc)
            snap = await asyncio.to_thread(SCHEDULE.get)
            last = (snap.to_dict() or {}) if snap.exists else {}
            for name, due, job in SCHEDULED_JOBS:
                if not due(now, last.get(name)):
                    continue
                # Avval belgilaymiz — xato bo'lsa ham bir kunda qayta-qayta urinib spam qilmaydi
                await asyncio.to_thread(SCHEDULE.set, {name: local_date(now)}, merge=True)
                try:
                    await job(bot)
                except Exception:  # noqa: BLE001
                    log.exception("Rejali ish xatosi: %s", name)
        except Exception:  # noqa: BLE001
            log.exception("Rejalashtiruvchi xatosi")
        await asyncio.sleep(SCHEDULE_CHECK_EVERY)


@router.message(Command("backup"))
async def backup_cmd(message: Message, bot: Bot):
    if not is_admin(message.from_user.id):
        return
    wait = await message.answer("💾 Zaxira nusxa tayyorlanmoqda…")
    try:
        await ops.send_backup(db, bot, [message.chat.id], "qo‘lda")
        await wait.delete()
    except Exception as e:  # noqa: BLE001
        log.exception("Qo'lda zaxira nusxa xatosi")
        await wait.edit_text(f"❌ Zaxira nusxa olinmadi: {escape(str(e))[:300]}")


# ---------------- Main ----------------
def ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()  # tizim ombori
    ctx.load_verify_locations(certifi.where())
    return ctx


def make_session() -> AiohttpSession:
    """Telegram'ga ulanish: certifi + tizim (Windows/Linux) sertifikatlari.
    Antivirus (masalan Avast) yoki korporativ proxy HTTPS'ni o'z sertifikati bilan tekshirsa ham ishlaydi —
    aiogram standart holatda faqat certifi'ga ishonadi va CERTIFICATE_VERIFY_FAILED beradi."""
    session = AiohttpSession()
    session._connector_init["ssl"] = ssl_context()
    return session


async def main():
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,  # Railway/Render/Docker loglari stdout'dan o'qiladi
        force=True,
    )
    logging.getLogger("aiogram.event").setLevel(logging.WARNING)
    log_listener = install_firestore_logging()
    logging.getLogger().addHandler(ops.ErrorCounter())
    health = await ops.start_health_server()
    bot = Bot(BOT_TOKEN, session=make_session(), default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.include_router(router)
    dp.include_router(fallback_router)
    # Faqat bitta nusxa ishlaydi: boshqasi (masalan kompyuterdagi bot) ishlayotgan bo'lsa — kutamiz
    await ops.acquire_lock(db)

    # Ishga tushishda tarmoq vaqtincha uzilsa — yiqilmasdan qayta urinamiz (5, 10, 20, 40 s)
    for attempt in range(5):
        try:
            await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Ochish", web_app=WebAppInfo(url=WEBAPP_URL)))
            break
        except TelegramNetworkError as e:
            if attempt == 4:
                raise
            wait = 5 * 2 ** attempt
            log.warning("Telegram'ga ulanib bo'lmadi (%s) — %s s dan keyin qayta urinaman", e, wait)
            await asyncio.sleep(wait)
    user_cmds = [
        BotCommand(command="start", description="Bosh menyu"),
        BotCommand(command="markaz", description="Markazni qo‘shish / boshqarish"),
        BotCommand(command="help", description="Yordam"),
        BotCommand(command="qr", description="Markazim QR kodi"),
        BotCommand(command="delete", description="Ma’lumotlarimni o‘chirish"),
        BotCommand(command="cancel", description="Bekor qilish"),
    ]
    await bot.set_my_commands(user_cmds)
    # Admin buyruqlari faqat adminlarning menyusida
    admin_cmds = user_cmds + [
        BotCommand(command="admin", description="Admin panel"),
        BotCommand(command="stat", description="Statistika"),
        BotCommand(command="logs", description="Oxirgi xatolar"),
        BotCommand(command="backup", description="Zaxira nusxa olish"),
        BotCommand(command="claimcode", description="Markaz egasi uchun kod"),
        BotCommand(command="link", description="Kampaniya havolasi (flyer, maktab…)"),
    ]
    for admin in ADMIN_IDS:
        try:
            await bot.set_my_commands(admin_cmds, scope=BotCommandScopeChat(chat_id=admin))
        except Exception as e:  # noqa: BLE001 — admin botni hali boshlamagan bo'lishi mumkin
            log.info("Admin %s menyusi o'rnatilmadi: %s", admin, e)

    me = await bot.get_me()
    global BOT_USERNAME
    BOT_USERNAME = me.username or BOT_USERNAME
    # Web app «Ulashish» va «Markaz qo‘shish» havolalari uchun bot username'i (ochiq ma'lumot)
    # Ochiq sozlamalar: bot username (ulashish havolalari) va AI yoqilganmi
    await asyncio.to_thread(
        db.collection("meta").document("public").set,
        {"botUsername": me.username, "aiEnabled": bool(GROQ_API_KEY), "inlineEnabled": bool(me.supports_inline_queries)}, merge=True
    )

    loop = asyncio.get_running_loop()
    # Firestore kuzatuvchilari: internet uzilsa (kompyuter uyqusi, server qayta ulanishi) jimgina to'xtab
    # qolishi mumkin — qo'riqchi har daqiqada tekshiradi va o'chganini qayta ishga tushiradi.
    factories = {
        "arizalar": lambda: start_application_watcher(bot, loop),
        "tasdiqlash (Telegram)": start_link_watcher,
        "chat": lambda: start_chat_watcher(bot, loop),
        "ariza holati": lambda: start_status_watcher(bot, loop),
        "bo'sh joylar": lambda: start_seats_watcher(bot, loop),
        "ma'lumot o'chirish": lambda: start_delete_watcher(bot, loop),
        "markaz tasdiqlash": lambda: start_approval_watcher(bot, loop),
        "egallash so'rovlari": lambda: start_claim_watcher(bot, loop),
        "bot so'rovlari (QR)": lambda: start_botreq_watcher(bot, loop),
        "shikoyatlar": lambda: start_report_watcher(bot, loop),
    }
    if GROQ_API_KEY:
        factories["AI"] = lambda: start_ai_watcher(loop)
    watchers = {name: make() for name, make in factories.items()}
    supervisor = asyncio.create_task(supervise_watchers(watchers, factories))
    await asyncio.to_thread(ensure_admin_claims)
    reminder = asyncio.create_task(reminder_loop(bot))
    cleanup = asyncio.create_task(cleanup_loop())
    scheduler = asyncio.create_task(scheduler_loop(bot))
    ratings = asyncio.create_task(rating_loop(bot))
    self_check = asyncio.create_task(ops.self_check_loop(lambda text: notify_admins(bot, text)))
    lost = {"v": False}

    async def on_lock_lost():
        lost["v"] = True
        await dp.stop_polling()

    ops.STATE.last_ok = time.time()
    heartbeat = asyncio.create_task(ops.heartbeat_loop(db, bot, on_lock_lost))
    log.info("Bot ishga tushdi. Adminlar: %s | AI: %s", ", ".join(map(str, ADMIN_IDS)) or "yo‘q",
             f"Groq ({GROQ_MODEL})" if GROQ_API_KEY else "o‘chiq (GROQ_API_KEY yo‘q)")
    try:
        await dp.start_polling(bot)
    finally:
        supervisor.cancel()
        for w in watchers.values():
            try:
                w.unsubscribe()
            except Exception:  # noqa: BLE001
                pass
        for t in (reminder, cleanup, scheduler, self_check, heartbeat, ratings):
            t.cancel()
        if not lost["v"]:
            await asyncio.to_thread(ops.release_lock, db)
        if health:
            await health.cleanup()
        log_listener.stop()
        await bot.session.close()
    if lost["v"]:
        sys.exit(1)  # qayta ishga tushganda yana qulfni kutadi


if __name__ == "__main__":
    asyncio.run(main())
