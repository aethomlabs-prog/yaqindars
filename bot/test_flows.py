"""Bot oqimlari (Telegram'ga ulanmasdan): haqiqiy Dispatcher + soxta Telegram sessiyasi.
Ishga tushirish (bot/ papkasida):  python -m unittest test_flows -v
Firestore'ga faqat o'qish so'rovlari bo'lishi mumkin (markazlar ro'yxati); hech narsa yozilmaydi."""
import asyncio
import os
import unittest
from datetime import datetime

os.environ.setdefault("LOG_LEVEL", "WARNING")

from aiogram import Bot, Dispatcher  # noqa: E402
from aiogram.client.default import DefaultBotProperties  # noqa: E402
from aiogram.client.session.base import BaseSession  # noqa: E402
from aiogram.enums import ParseMode  # noqa: E402
from aiogram.methods import AnswerCallbackQuery, DeleteMessage, GetChatMember, GetMe, SendMessage  # noqa: E402
from aiogram.types import (  # noqa: E402
    CallbackQuery,
    Chat,
    ChatMemberLeft,
    ChatMemberMember,
    ChatMemberUpdated,
    Message,
    Update,
    User,
)

import main as m  # noqa: E402

CHANNEL = Chat(id=-1001, type="channel", username=m.REQUIRED_CHANNEL, title="Kanal")
BOT_USER = User(id=42, is_bot=True, first_name="YaqinDars", username="yaqindars_bot")


class FakeSession(BaseSession):
    """Telegram o'rniga: so'rovlarni yozib boradi, kerakli javobni qaytaradi."""

    def __init__(self):
        super().__init__()
        self.calls = []
        self.members: set[int] = set()  # kanalga obuna bo'lganlar

    async def make_request(self, bot, method, timeout=None):
        self.calls.append(method)
        if isinstance(method, GetChatMember):
            u = User(id=method.user_id, is_bot=False, first_name="U")
            return ChatMemberMember(user=u) if method.user_id in self.members else ChatMemberLeft(user=u)
        if isinstance(method, SendMessage):
            return Message(message_id=len(self.calls), date=datetime.now(), chat=Chat(id=method.chat_id, type="private"), text=method.text)
        if isinstance(method, (AnswerCallbackQuery, DeleteMessage)):
            return True
        if isinstance(method, GetMe):
            return BOT_USER
        return True

    async def close(self):
        pass

    async def stream_content(self, *a, **k):  # pragma: no cover
        yield b""


def user(uid: int) -> User:
    return User(id=uid, is_bot=False, first_name="Ota")


def msg(uid: int, text: str) -> Update:
    return Update(update_id=1, message=Message(message_id=1, date=datetime.now(), chat=Chat(id=uid, type="private"), from_user=user(uid), text=text))


def cb(uid: int, data: str) -> Update:
    mess = Message(message_id=5, date=datetime.now(), chat=Chat(id=uid, type="private"), from_user=BOT_USER, text="…")
    return Update(update_id=2, callback_query=CallbackQuery(id="c1", from_user=user(uid), chat_instance="x", data=data, message=mess))


def left(uid: int) -> Update:
    return Update(update_id=3, chat_member=ChatMemberUpdated(
        chat=CHANNEL, from_user=user(uid), date=datetime.now(),
        old_chat_member=ChatMemberMember(user=user(uid)), new_chat_member=ChatMemberLeft(user=user(uid))))


class FlowTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.loop = asyncio.new_event_loop()
        cls.dp = Dispatcher()
        cls.dp.include_router(m.router)
        cls.dp.include_router(m.fallback_router)

    @classmethod
    def tearDownClass(cls):
        cls.loop.close()

    def setUp(self):
        self.s = FakeSession()
        self.bot = Bot("123:TEST", session=self.s, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        m._sub_cache.clear()

    def feed(self, update: Update):
        self.loop.run_until_complete(self.dp.feed_update(self.bot, update))

    def sent(self):
        return [c for c in self.s.calls if isinstance(c, SendMessage)]

    def buttons(self):
        out = []
        for c in self.sent():
            kb = c.reply_markup
            for row in getattr(kb, "inline_keyboard", None) or []:
                out.extend(row)
        return out

    def assert_valid_buttons(self):
        for b in self.buttons():
            if b.web_app:
                self.assertTrue(b.web_app.url.startswith("https://") and "t.me/" not in b.web_app.url, b.web_app.url)

    # --- ssenariylar ---
    def test_not_subscribed_start_shows_gate(self):
        self.feed(msg(1001, "/start"))
        sent = self.sent()
        self.assertEqual(len(sent), 1)
        self.assertIn("obuna", sent[0].text.lower())
        urls = [b.url for b in self.buttons() if b.url]
        self.assertEqual(urls, [f"https://t.me/{m.REQUIRED_CHANNEL}"])
        self.assertTrue(any(b.callback_data == "sub:start" for b in self.buttons()))
        self.assert_valid_buttons()

    def test_press_done_before_subscribing_shows_alert(self):
        self.feed(cb(1002, "sub:start"))
        ans = [c for c in self.s.calls if isinstance(c, AnswerCallbackQuery)]
        self.assertTrue(ans and ans[0].show_alert)
        self.assertEqual(self.sent(), [])

    def test_subscribe_then_press_done_shows_welcome(self):
        self.s.members.add(1003)
        self.feed(cb(1003, "sub:start"))
        texts = " ".join(c.text for c in self.sent())
        self.assertIn("Assalomu alaykum", texts)
        self.assertIn("YaqinDars", texts)
        self.assert_valid_buttons()

    def test_subscribed_start_goes_straight_to_welcome(self):
        self.s.members.add(1004)
        self.feed(msg(1004, "/start"))
        self.assertEqual(len(self.sent()), 2)
        self.assertNotIn("obuna bo‘ling", self.sent()[0].text)
        self.assert_valid_buttons()

    def test_leaving_channel_clears_cache_and_asks_again(self):
        uid = 1005
        self.s.members.add(uid)
        self.feed(msg(uid, "/start"))  # obunachi sifatida eslab qolindi
        self.assertIn(uid, m._sub_cache)
        self.s.members.discard(uid)
        self.s.calls.clear()
        self.feed(left(uid))
        self.assertNotIn(uid, m._sub_cache)
        self.assertIn("kanalidan chiqdingiz", self.sent()[0].text)
        self.assert_valid_buttons()
        self.s.calls.clear()
        self.feed(msg(uid, "/start"))  # endi yana obuna so'raladi (10 daqiqa kutmasdan)
        self.assertIn("obuna", self.sent()[0].text.lower())

    def test_admin_is_not_gated(self):
        admin = sorted(m.ADMIN_IDS)[0]
        self.feed(msg(admin, "/start"))
        self.assertFalse(any(isinstance(c, GetChatMember) for c in self.s.calls))
        self.assertEqual(len(self.sent()), 2)

    def test_menu_buttons_are_gated_and_work_after_subscribe(self):
        self.feed(msg(1006, m.BTN_OPEN))
        self.assertIn("obuna", self.sent()[0].text.lower())
        self.s.members.add(1006)
        self.s.calls.clear()
        self.feed(msg(1006, m.BTN_OPEN))
        self.assertIn("Ilovani ochish", self.sent()[0].text)
        self.assert_valid_buttons()

    def test_teacher_gate_continues_to_teacher(self):
        self.feed(msg(1007, m.BTN_TEACHER))
        self.assertTrue(any(b.callback_data == "sub:teacher" for b in self.buttons()))

    def test_help_and_admin_contact(self):
        self.feed(msg(1008, "/help"))
        self.assertTrue(self.sent())
        self.s.calls.clear()
        self.feed(msg(1008, m.BTN_ADMIN))
        urls = [b.url for b in self.buttons() if b.url]
        self.assertTrue(any("t.me/" in u for u in urls))
        self.assert_valid_buttons()


if __name__ == "__main__":
    unittest.main()
