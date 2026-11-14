"""Parser testlari. Ishga tushirish:  python -m unittest test_parsers -v   (bot/ papkasida)"""
import unittest

import json

import hashlib
import hmac
from datetime import datetime, timezone
from urllib.parse import urlencode

from parsers import ai_catalog, parse_ai_reply, RegError, next_lesson, normalize_phone, parse_days, parse_int, parse_registration, parse_time, validate_init_data


class DaysTest(unittest.TestCase):
    def test_short_codes(self):
        self.assertEqual(parse_days("Du, Ch, Ju"), ["Du", "Ch", "Ju"])

    def test_full_names(self):
        self.assertEqual(parse_days("dushanba, juma"), ["Du", "Ju"])
        self.assertEqual(parse_days("Seshanba payshanba shanba"), ["Se", "Pa", "Sh"])
        self.assertEqual(parse_days("chorshanba, yakshanba"), ["Ch", "Ya"])

    def test_mixed_separators_order_and_duplicates(self):
        self.assertEqual(parse_days("Ju-Du-Ch"), ["Du", "Ch", "Ju"])
        self.assertEqual(parse_days("du du; ju"), ["Du", "Ju"])
        self.assertEqual(parse_days("Du va Ju"), ["Du", "Ju"])

    def test_invalid(self):
        self.assertIsNone(parse_days(""))
        self.assertIsNone(parse_days("har kuni"))
        self.assertIsNone(parse_days("Du, Xa"))
        self.assertIsNone(parse_days("d"))


class TimeTest(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(parse_time("16:00-17:30"), "16:00–17:30")
        self.assertEqual(parse_time("9.00 – 10.30"), "09:00–10:30")
        self.assertEqual(parse_time(" 8:05—9:15 "), "08:05–09:15")

    def test_invalid(self):
        self.assertIsNone(parse_time("16-17"))
        self.assertIsNone(parse_time("25:00-26:00"))
        self.assertIsNone(parse_time("16:70-17:00"))
        self.assertIsNone(parse_time("18:00-17:00"))
        self.assertIsNone(parse_time("ertalab"))


class IntTest(unittest.TestCase):
    def test_price(self):
        self.assertEqual(parse_int("250000", 10_000, 10_000_000), 250000)
        self.assertEqual(parse_int("250 000", 10_000, 10_000_000), 250000)
        self.assertEqual(parse_int("1.200.000 so‘m", 10_000, 10_000_000), 1200000)
        self.assertIsNone(parse_int("5000", 10_000, 10_000_000))
        self.assertIsNone(parse_int("20000000", 10_000, 10_000_000))
        self.assertIsNone(parse_int("ikki yuz ming", 10_000, 10_000_000))
        self.assertIsNone(parse_int("16:00", 10_000, 10_000_000))

    def test_seats(self):
        self.assertEqual(parse_int("0", 0, 100), 0)
        self.assertEqual(parse_int("100", 0, 100), 100)
        self.assertIsNone(parse_int("101", 0, 100))
        self.assertIsNone(parse_int("-3", 0, 100))
        self.assertIsNone(parse_int("", 0, 100))


class PhoneTest(unittest.TestCase):
    def test_valid(self):
        self.assertEqual(normalize_phone("+998 90 123-45-67"), "+998901234567")
        self.assertEqual(normalize_phone("998901234567"), "+998901234567")
        self.assertEqual(normalize_phone("90 123 45 67"), "+998901234567")

    def test_invalid(self):
        self.assertIsNone(normalize_phone("+7 999 123 45 67"))
        self.assertIsNone(normalize_phone("12345"))
        self.assertIsNone(normalize_phone(""))



def _reg(**over):
    d = {
        "v": 1, "t": "vip", "k": "center", "n": "Bilimdon  markazi", "p": "+998 90 123 45 67",
        "a": "Rishton, Navoiy 5", "la": 40.3567, "lo": 71.2847, "d": "Yaxshi markaz", "af": 7, "at": 17,
        "am": ["Wi-Fi"], "g": [["Ingliz tili", "Du,Ch,Ju", "16:00–17:30", 300000, 3]],
        "tc": [["Nilufar Rahimova", "Ingliz tili", 8, "IELTS 8.0"]],
    }
    d.update(over)
    return json.dumps(d, ensure_ascii=False)


class RegistrationTest(unittest.TestCase):
    def test_valid(self):
        r = parse_registration(_reg())
        self.assertEqual(r["tariff"], "vip")
        self.assertEqual(r["name"], "Bilimdon markazi")
        self.assertEqual(r["phone"], "+998901234567")
        self.assertEqual(r["groups"][0], {"subject": "Ingliz tili", "days": ["Du", "Ch", "Ju"], "time": "16:00–17:30", "price": 300000, "freeSeats": 3})
        self.assertEqual(r["teachers"][0]["experience"], 8)

    def test_rejects(self):
        bad = [
            _reg(t="gold"), _reg(p="123"), _reg(la=None), _reg(la=200), _reg(g=[]),
            _reg(g=[["IT", "Xx", "16:00–17:00", 100000, 1]]), _reg(g=[["IT", "Du", "17:00–16:00", 100000, 1]]),
            _reg(g=[["IT", "Du", "16:00–17:00", 5, 1]]), _reg(g=[["IT", "Du", "16:00–17:00", 100000, True]]),
            _reg(n="A"), _reg(v=2), "not json", "", _reg(tc=[["X", "IT", 1, ""]]),
        ]
        for raw in bad:
            with self.assertRaises(RegError, msg=raw[:80]):
                parse_registration(raw)

    def test_optional_and_swap(self):
        r = parse_registration(_reg(af=17, at=7, tc=[], am=[], d=""))
        self.assertEqual((r["ageFrom"], r["ageTo"]), (7, 17))
        self.assertEqual(r["teachers"], [])


TOKEN = "123:ABC"


def _signed(fields: dict, token: str = TOKEN) -> str:
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    return urlencode({**fields, "hash": hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()})


class InitDataTest(unittest.TestCase):
    fields = {"auth_date": "1000", "query_id": "Q", "user": json.dumps({"id": 42, "first_name": "Ali"}), "signature": "sig"}

    def test_valid(self):
        self.assertEqual(validate_init_data(_signed(self.fields), TOKEN, now=1500)["id"], 42)

    def test_invalid(self):
        good = _signed(self.fields)
        self.assertIsNone(validate_init_data(good, "999:OTHER", now=1500))        # boshqa bot
        self.assertIsNone(validate_init_data(good.replace("Ali", "Vali"), TOKEN, now=1500))  # o'zgartirilgan
        self.assertIsNone(validate_init_data(good, TOKEN, now=1000 + 86401))       # eskirgan
        self.assertIsNone(validate_init_data("", TOKEN))
        self.assertIsNone(validate_init_data("user=x", TOKEN))


class NextLessonTest(unittest.TestCase):
    def test_next(self):
        now = datetime(2026, 11, 16, 10, 0, tzinfo=timezone.utc)  # dushanba
        r = next_lesson(["Du", "Ch"], "16:00–17:30", now)
        self.assertEqual((r.weekday(), r.hour, r.minute), (2, 16, 0))  # chorshanba 16:00
        self.assertIsNone(next_lesson([], "16:00", now))


class AiTest(unittest.TestCase):
    centers = [
        {"id": "a", "name": "Uzoq", "lat": 41.0, "lng": 71.0, "groups": [{"subject": "IT", "days": ["Du"], "time": "10:00–11:00", "price": 100000, "freeSeats": 2}]},
        {"id": "b", "name": "Yaqin", "lat": 40.357, "lng": 71.285, "vip": True, "rating": 4.8, "ageFrom": 7, "ageTo": 12,
         "groups": [{"subject": "Ingliz tili", "days": ["Se", "Pa"], "time": "16:00–17:30", "price": 300000, "freeSeats": 0}],
         "teachers": [{"subject": "Ingliz tili"}]},
    ]

    def test_catalog_sorted_and_limited(self):
        text, ids = ai_catalog(self.centers, 40.357, 71.285, limit=1)
        self.assertEqual(ids, {"b"})
        self.assertIn("id=b", text)
        self.assertIn("bo‘sh joy 0", text)
        self.assertIn("7–12 yosh", text)

    def test_reply_filters_unknown_ids(self):
        r = parse_ai_reply('{"text": "Mana", "cards": ["b", "x", "b", "a"]}', {"a", "b"})
        self.assertEqual(r, {"text": "Mana", "cards": ["b", "a"]})

    def test_reply_extracts_json_and_rejects_garbage(self):
        self.assertEqual(parse_ai_reply('Javob: {"text": "Ok", "cards": []} tamom', {"a"})["text"], "Ok")
        self.assertIsNone(parse_ai_reply("salom", {"a"}))
        self.assertIsNone(parse_ai_reply('{"cards": ["a"]}', {"a"}))

if __name__ == "__main__":
    unittest.main()
