"""YaqinDars Telegram bot (aiogram 3, polling).

- Ota-onalar uchun: /start -> "Xaritani ochish" (Telegram Mini App)
- Markazlar uchun: /markaz -> ro'yxatdan o'tish, guruhlar, bo'sh joy va narxni yangilash
- Mini App'dan kelgan arizalarni markaz egasiga yuboradi
- Ma'lumot 7 kundan beri yangilanmasa, markazga eslatma yuboradi
- Admin: tasdiqlash / rad etish, /vip, /stat
"""
import asyncio
import json
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
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

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
PRIVACY_URL = urljoin(WEBAPP_URL.split("?")[0], "privacy")  # webapp/public/privacy.html

import firebase_admin  # noqa: E402
from aiogram import Bot, Dispatcher, F, Router  # noqa: E402
from aiogram.client.default import DefaultBotProperties  # noqa: E402
from aiogram.enums import ParseMode  # noqa: E402
from aiogram.exceptions import TelegramBadRequest  # noqa: E402
from aiogram.filters import Command, CommandObject, CommandStart, StateFilter  # noqa: E402
from aiogram.fsm.context import FSMContext  # noqa: E402
from aiogram.fsm.state import State, StatesGroup  # noqa: E402
from aiogram.types import (  # noqa: E402
    BotCommand,
    ErrorEvent,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    MenuButtonWebApp,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    WebAppInfo,
)
from firebase_admin import auth as fb_auth, credentials, firestore  # noqa: E402
from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: E402

from parsers import (  # noqa: E402
    TARIFF_PRICES,
    TASHKENT,
    RegError,
    next_lesson,
    normalize_phone,
    parse_days,
    parse_int,
    parse_registration,
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
DELETE_REQS = db.collection("deleteRequests")  # ilovadagi «Ma’lumotlarimni o‘chirish»

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
        lines.append(f"Tarif: {'VIP' if tariff == 'vip' else 'Oddiy'} — {fmt_sum(TARIFF_PRICES[tariff])}/oy")
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
        reply_markup=ReplyKeyboardRemove(),
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
                KeyboardButton(text=BTN_OPEN, web_app=WebAppInfo(url=WEBAPP_URL), style="primary"),
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


@router.message(CommandStart())
async def start(message: Message, state: FSMContext, command: CommandObject):
    await state.clear()
    if (command.args or "").strip() == "markaz":  # t.me/BOT?start=markaz (ilovadagi «Markazingizni qo‘shing»)
        return await markaz(message, state)
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


@router.message(F.text == BTN_INSTALL)
@router.message(F.text == BTN_OPEN)
async def menu_open(message: Message, state: FSMContext):
    await state.clear()
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
    # Eski Telegram'da web_app reply tugmasi oddiy matn bo'lib keladi — inline tugma bilan javob beramiz
    kb = InlineKeyboardMarkup(inline_keyboard=[[ibtn("🚀 Ochish", WEBAPP_URL, "primary")]])
    await message.answer("Pastdagi tugmani bosing 👇", reply_markup=kb)


@router.message(F.text == BTN_TEACHER)
async def menu_teacher(message: Message, state: FSMContext):
    await state.clear()
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
    await message.answer("Menyu 👇", reply_markup=main_menu())


# ---------------- Admin bilan bog'lanish ----------------
@router.message(F.text == BTN_ADMIN)
async def menu_admin(message: Message, state: FSMContext):
    if not ADMIN_IDS:
        return await message.answer("Hozircha admin ulanmagan. Keyinroq urinib ko‘ring.")
    await state.set_state(Support.ask)
    await message.answer(
        "✍️ Savolingiz yoki taklifingizni bitta xabarda yozing — adminga yetkazaman va javobni shu yerga yuboraman.\n\n"
        "Bekor qilish: /cancel",
        reply_markup=ReplyKeyboardRemove(),
    )


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
        text += "\n\nAdmin:\n/vip MARKAZ_ID — VIP ni yoqish/o‘chirish\n/stat — statistika\n/logs — oxirgi xatolar"
    await message.answer(text, disable_web_page_preview=True)


@router.message(Command("id"))
async def my_id(message: Message):
    await message.answer(f"Sizning Telegram ID: <code>{message.from_user.id}</code>")


def register_keyboard(text: str = "📝 Markazni qo‘shish") -> ReplyKeyboardMarkup:
    """Mini App faqat REPLY-klaviatura tugmasidan ochilganda sendData() ishlaydi."""
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=text, web_app=WebAppInfo(url=REGISTER_URL))]],
        resize_keyboard=True,
        input_field_placeholder="Pastdagi tugmani bosing",
    )


TARIFF_TEXT = (
    "💼 <b>Tariflar</b> (birinchi oy — bepul):\n"
    f"• <b>Oddiy</b> — {fmt_sum(TARIFF_PRICES['oddiy'])}/oy: xaritada ko‘rinish, arizalar botga keladi\n"
    f"• <b>VIP</b> — {fmt_sum(TARIFF_PRICES['vip'])}/oy: ro‘yxatda birinchi, xaritada oltin belgi, «Tavsiya etilgan» bo‘limida"
)


@router.message(Command("markaz"))
async def markaz(message: Message, state: FSMContext):
    await state.clear()
    if message.chat.type != "private":
        return await message.answer("Markaz paneli faqat bot bilan shaxsiy chatda ishlaydi.")
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
            reply_markup=ReplyKeyboardRemove(),
        )
    if any(c.get("name") == data["name"] and not c.get("approved") for c in existing):
        return await message.answer(
            "Bu markaz allaqachon yuborilgan va admin tekshiruvida. Panel: /markaz",
            reply_markup=ReplyKeyboardRemove(),
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
        f"Tarif: {tariff_name} — birinchi oy bepul.\n\n"
        "Admin tekshirgach (odatda 1 kun ichida) markazingiz xaritada ko‘rinadi. "
        "Bo‘sh joylar va narxlarni quyidagi panelda boshqarasiz:",
        reply_markup=ReplyKeyboardRemove(),
    )
    await send_panel(message, ref.id)
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="📱 Ilovani ochish", web_app=WebAppInfo(url=WEBAPP_URL))]])
    await message.answer("Ota-onalar markazingizni qanday ko‘rishini ilovada tekshiring:", reply_markup=kb)
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
        reply_markup=ReplyKeyboardRemove(),
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
    upd = {"status": status, "statusBy": "bot", "updatedAt": firestore.SERVER_TIMESTAMP}
    trial = None
    if status == "accepted":
        groups = c.get("groups") or []
        gi = app.get("groupIndex")
        g = groups[gi] if isinstance(gi, int) and 0 <= gi < len(groups) else None
        trial = next_lesson(g.get("days"), g.get("time")) if g else None
        if trial:
            upd["trialAt"] = trial
    await asyncio.to_thread(APPS.document(app_id).update, upd)

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
            upd["vip"] = True  # VIP tarif: birinchi oy bepul
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


# ---------------- Fallbacks (eng oxirida bo'lishi shart) ----------------
@router.callback_query()
async def stale_callback(call: CallbackQuery):
    await call.answer("Bu tugma eskirgan. /markaz ni qayta oching.")


@router.message(StateFilter(None))
async def no_state(message: Message):
    await message.answer("Quyidagilardan birini tanlang 👇", reply_markup=welcome_kb())
    await message.answer("Yoki pastdagi menyudan foydalaning.", reply_markup=main_menu())


@router.message()
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
            uid = w.get("userTgId")
            prefs = as_dict(await asyncio.to_thread(USERS.document(str(uid)).get)) if isinstance(uid, int) else {}
            if (prefs.get("notify") or {}).get("seats") is not False:
                await notify_user(
                    bot, uid,
                    f"🎉 <b>{escape(str(center.get('name', '')))}</b> — «{escape(str(g.get('subject', '')))}» guruhida joy bo‘shadi!\n"
                    "Tezroq yoziling — joylar cheklangan.",
                )
            await asyncio.to_thread(d.reference.update, {"notified": True})
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


# ---------------- Kabinetdagi o'zgarishlar -> ota-onalarga xabar ----------------
async def notify_status_from_web(bot: Bot, ref):
    snap = await asyncio.to_thread(ref.get)
    a = as_dict(snap)
    st = a.get("status")
    if a.get("statusBy") != "web" or st not in ("accepted", "rejected") or a.get("statusNotified") == st:
        return
    await asyncio.to_thread(ref.update, {"statusNotified": st})
    name = escape(str(a.get("centerName", "")))
    if st == "accepted":
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


# ---------------- Main ----------------
async def main():
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stdout,  # Railway/Render/Docker loglari stdout'dan o'qiladi
        force=True,
    )
    logging.getLogger("aiogram.event").setLevel(logging.WARNING)
    log_listener = install_firestore_logging()
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.include_router(router)

    await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Ochish", web_app=WebAppInfo(url=WEBAPP_URL)))
    await bot.set_my_commands([
        BotCommand(command="start", description="Bosh menyu"),
        BotCommand(command="markaz", description="Markazni qo‘shish / boshqarish"),
        BotCommand(command="help", description="Yordam"),
        BotCommand(command="delete", description="Ma’lumotlarimni o‘chirish"),
        BotCommand(command="cancel", description="Bekor qilish"),
    ])

    me = await bot.get_me()
    # Web app «Ulashish» va «Markaz qo‘shish» havolalari uchun bot username'i (ochiq ma'lumot)
    await asyncio.to_thread(db.collection("meta").document("public").set, {"botUsername": me.username}, merge=True)

    loop = asyncio.get_running_loop()
    watch = start_application_watcher(bot, loop)
    links = start_link_watcher()
    chats = start_chat_watcher(bot, loop)
    statuses = start_status_watcher(bot, loop)
    seats = start_seats_watcher(bot, loop)
    deletes = start_delete_watcher(bot, loop)
    reminder = asyncio.create_task(reminder_loop(bot))
    cleanup = asyncio.create_task(cleanup_loop())
    log.info("Bot ishga tushdi. Adminlar: %s", ", ".join(map(str, ADMIN_IDS)) or "yo‘q")
    try:
        await dp.start_polling(bot)
    finally:
        watch.unsubscribe()
        links.unsubscribe()
        chats.unsubscribe()
        statuses.unsubscribe()
        seats.unsubscribe()
        deletes.unsubscribe()
        reminder.cancel()
        cleanup.cancel()
        log_listener.stop()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
