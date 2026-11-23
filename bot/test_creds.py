"""Firebase kalitini o'qish (Render/Railway o'zgaruvchilari va Secret File). Haqiqiy kalit ishlatilmaydi."""
import base64
import json
import os
import tempfile
import unittest

from parsers import CredError, load_service_account

FAKE = {"type": "service_account", "project_id": "demo", "private_key": "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n", "client_email": "x@demo.iam"}
RAW = json.dumps(FAKE)


class CredTest(unittest.TestCase):
    def test_raw_json(self):
        self.assertEqual(load_service_account(RAW, "nope.json", ()), FAKE)

    def test_quoted_and_spaces(self):
        self.assertEqual(load_service_account(f"  '{RAW}'  ", "nope.json", ()), FAKE)
        self.assertEqual(load_service_account(f'"{RAW}"', "nope.json", ()), FAKE)

    def test_base64(self):
        self.assertEqual(load_service_account(base64.b64encode(RAW.encode()).decode(), "nope.json", ()), FAKE)

    def test_path_in_variable_and_secret_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "serviceAccount.json")
            with open(p, "w") as f:
                f.write(RAW)
            self.assertEqual(load_service_account(p, "nope.json", ()), p)          # o'zgaruvchiga yo'l yozilgan
            self.assertEqual(load_service_account("", "nope.json", (p,)), p)       # Render Secret File
            self.assertEqual(load_service_account("", p, ()), p)                   # oddiy fayl (kompyuter)

    def test_clear_errors_without_leaking(self):
        with self.assertRaises(CredError) as e:
            load_service_account("yoq-fayl.json", "nope.json", ())
        self.assertIn("JSON emas", str(e.exception))
        with self.assertRaises(CredError) as e:
            load_service_account('{"type": "service_account", "private_key": "x"', "nope.json", ())
        self.assertIn("buzilgan", str(e.exception))
        with self.assertRaises(CredError):
            load_service_account('{"a": 1}', "nope.json", ())
        with self.assertRaises(CredError) as e:
            load_service_account("", "nope.json", ())
        self.assertIn("topilmadi", str(e.exception))
        secret = "SECRET-VALUE-123456789"
        with self.assertRaises(CredError) as e:
            load_service_account(secret, "nope.json", ())
        self.assertNotIn(secret, str(e.exception))


if __name__ == "__main__":
    unittest.main()
