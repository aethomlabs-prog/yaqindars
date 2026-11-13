"""Parser testlari. Ishga tushirish:  python -m unittest test_parsers -v   (bot/ papkasida)"""
import unittest

from parsers import normalize_phone, parse_days, parse_int, parse_time


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


if __name__ == "__main__":
    unittest.main()
