"""YaqinDars Telegram bot (aiogram 3, polling).

- Ota-onalar uchun: /start -> "Xaritani ochish" (Telegram Mini App)
- Markazlar uchun: /markaz -> ro'yxatdan o'tish, guruhlar, bo'sh joy va narxni yangilash
- Mini App'dan kelgan arizalarni markaz egasiga yuboradi
- Ma'lumot 7 kundan beri yangilanmasa, markazga eslatma yuboradi
- Admin: tasdiqlash / rad etish, /vip, /stat
"""
import asyncio
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from html import escape
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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
if not os.path.isfile(CRED_PATH):
    sys.exit(f"XATO: Firebase service account fayli topilmadi: {CRED_PATH}")

def _with_param(url: str, key: str, value: str) -> str:
    parts = urlsplit(url)
    q = dict(parse_qsl(parts.query))
    q[key] = value
    return urlunsplit(parts._replace(query=urlencode(q)))


# Markazni ro'yxatdan o'tkazish Mini App'i (o'sha web app, ?mode=register)
REGISTER_URL = _with_param(WEBAPP_URL, "mode", "register")

import firebase_admin  # noqa: E402
from aiogram import Bot, Dispatcher, F, Router  # noqa: E402
from aiogram.client.default import DefaultBotProperties  # noqa: E402
from aiogram.enums import ParseMode  # noqa: E402
from aiogram.exceptions import TelegramBadRequest  # noqa: E402
from aiogram.filters import Command, CommandStart, StateFilter  # noqa: E402
from aiogram.fsm.context import FSMContext  # noqa: E402
from aiogram.fsm.state import State, StatesGroup  # noqa: E402
from aiogram.types import (  # noqa: E402
    BotCommand,
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
from firebase_admin import credentials, firestore  # noqa: E402
from google.cloud.firestore_v1.base_query import FieldFilter  # noqa: E402

from parsers import (  # noqa: E402
    TARIFF_PRICES,
    RegError,
    normalize_phone,
    parse_days,
    parse_int,
    parse_registration,
    parse_time,
)

firebase_admin.initialize_app(credentials.Certificate(CRED_PATH))
db = firestore.client()
CENTERS = db.collection("centers")
APPS = db.collection("applications")

SUBJECTS = ["Ingliz tili", "Matematika", "IT", "Rus tili", "Kimyo", "Biologiya", "Fizika", "Ona tili", "Sport", "Boshqa"]
PRICE_MIN, PRICE_MAX = 10_000, 10_000_000
SEATS_MAX = 100
REMIND_AFTER = timedelta(days=7)
REMIND_CHECK_EVERY = 6 * 60 * 60  # soniya

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


@router.message(CommandStart())
async def start(message: Message, state: FSMContext):
    await state.clear()
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🗺 Xaritani ochish", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    await message.answer(
        "Assalomu alaykum! <b>YaqinDars</b> — uyingizga yaqin o‘quv markazlari, to‘garaklar va repetitorlar xaritasi.\n\n"
        "• Fan, narx va dars kunini tanlang\n"
        "• Guruhda bo‘sh joy borligini ko‘ring\n"
        "• Bir tugma bilan bepul sinov darsiga yoziling\n\n"
        "O‘quv markazi rahbarimisiz? /markaz",
        reply_markup=kb,
    )


@router.message(Command("help"))
async def help_cmd(message: Message):
    text = (
        "/start — xaritani ochish\n"
        "/markaz — markaz paneli (ro‘yxatdan o‘tish, guruhlar, bo‘sh joylar)\n"
        "/cancel — joriy amalni bekor qilish\n"
        "/id — Telegram ID’ingizni bilish"
    )
    if is_admin(message.from_user.id):
        text += "\n\nAdmin:\n/vip MARKAZ_ID — VIP ni yoqish/o‘chirish\n/stat — statistika"
    await message.answer(text)


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
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🗺 Xaritani ochish", web_app=WebAppInfo(url=WEBAPP_URL))]
    ])
    await message.answer("Buyruqlar: /start — xarita, /markaz — markaz paneli, /help — yordam", reply_markup=kb)


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
            "O‘quvchi bilan tezroq bog‘laning!"
        )
        try:
            await bot.send_message(c.get("ownerTgId"), text)
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


# ---------------- Weekly reminder ----------------
async def reminder_loop(bot: Bot):
    while True:
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
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    bot = Bot(BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.include_router(router)

    await bot.set_chat_menu_button(menu_button=MenuButtonWebApp(text="Xarita", web_app=WebAppInfo(url=WEBAPP_URL)))
    await bot.set_my_commands([
        BotCommand(command="start", description="Xaritani ochish"),
        BotCommand(command="markaz", description="Markazni qo‘shish / boshqarish"),
        BotCommand(command="help", description="Yordam"),
        BotCommand(command="cancel", description="Bekor qilish"),
    ])

    loop = asyncio.get_running_loop()
    watch = start_application_watcher(bot, loop)
    reminder = asyncio.create_task(reminder_loop(bot))
    log.info("Bot ishga tushdi. Adminlar: %s", ", ".join(map(str, ADMIN_IDS)) or "yo‘q")
    try:
        await dp.start_polling(bot)
    finally:
        watch.unsubscribe()
        reminder.cancel()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
