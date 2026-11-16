"""Yangi mantiq testlari:  python -m unittest test_logic -v   (bot/ papkasida)"""
import unittest
from datetime import datetime, timedelta, timezone

from logic import (
    CODE_ALPHABET,
    SUB_KEY,
    billing_action,
    billing_until,
    claim_code_error,
    fmt_change,
    is_claimed,
    make_claim_code,
    normalize_code,
    parse_latlng,
    parse_subjects,
    campaign_slug,
    remind_key,
    sum_stats,
    week_dates,
    weekly_tip,
    build_backup_zip,
    due_daily,
    due_weekly,
    from_jsonable,
    local_date,
    read_backup_zip,
    split_bytes,
    to_jsonable,
)

UTC = timezone.utc


def tsh(y, m, d, h, mi=0):
    """Toshkent vaqtini UTC datetime qilib beradi."""
    return datetime(y, m, d, h, mi, tzinfo=timezone(timedelta(hours=5))).astimezone(UTC)


class BackupTest(unittest.TestCase):
    def test_roundtrip(self):
        t = datetime(2026, 11, 16, 3, 0, tzinfo=UTC)
        cols = {
            "centers": [{"id": "c1", "data": to_jsonable({"name": "Mars", "updatedAt": t, "groups": [{"seats": 2}]})}],
            "users": [{"id": "5", "data": {}, SUB_KEY: {"children": [{"id": "k", "data": {"name": "Ali"}}]}}],
            "ratings": [],
        }
        z = build_backup_zip(cols, t)
        manifest, back = read_backup_zip(z)
        self.assertEqual(manifest["counts"], {"centers": 1, "users": 1, "ratings": 0})
        self.assertEqual(from_jsonable(back["centers"][0]["data"])["updatedAt"], t)
        self.assertEqual(back["users"][0][SUB_KEY]["children"][0]["data"]["name"], "Ali")

    def test_unknown_types_become_text(self):
        class Geo:
            def __str__(self):
                return "geo(40,71)"
        self.assertEqual(to_jsonable({"g": Geo()}), {"g": "geo(40,71)"})

    def test_split_and_join(self):
        data = bytes(range(256)) * 10
        parts = split_bytes(data, 1000)
        self.assertEqual(len(parts), 3)
        self.assertTrue(all(len(p) <= 1000 for p in parts))
        self.assertEqual(b"".join(parts), data)
        self.assertEqual(split_bytes(b"", 10), [b""])
        with self.assertRaises(ValueError):
            split_bytes(data, 0)


class ScheduleTest(unittest.TestCase):
    def test_daily_backup_at_3am_tashkent(self):
        self.assertFalse(due_daily(tsh(2026, 11, 16, 2, 59), 3, 0, "2026-11-15"))
        self.assertTrue(due_daily(tsh(2026, 11, 16, 3, 0), 3, 0, "2026-11-15"))
        self.assertTrue(due_daily(tsh(2026, 11, 16, 9, 0), 3, 0, None))  # bot kech yoqilsa ham bugun bajariladi
        self.assertFalse(due_daily(tsh(2026, 11, 16, 3, 5), 3, 0, "2026-11-16"))  # bugun bajarilgan

    def test_tashkent_date_not_utc(self):
        # UTC 22:30 = Toshkent ertasi 03:30
        t = datetime(2026, 11, 15, 22, 30, tzinfo=UTC)
        self.assertEqual(local_date(t), "2026-11-16")
        self.assertTrue(due_daily(t, 3, 0, "2026-11-15"))

    def test_weekly_monday_9(self):
        mon = tsh(2026, 11, 16, 9, 0)  # 16.11.2026 — dushanba
        self.assertEqual(mon.astimezone(timezone(timedelta(hours=5))).weekday(), 0)
        self.assertTrue(due_weekly(mon, 0, 9, 0, "2026-11-09"))
        self.assertFalse(due_weekly(tsh(2026, 11, 16, 8, 59), 0, 9, 0, "2026-11-09"))
        self.assertFalse(due_weekly(tsh(2026, 11, 17, 9, 0), 0, 9, 0, "2026-11-09"))  # seshanba
        self.assertFalse(due_weekly(mon, 0, 9, 0, "2026-11-16"))


class OpsTest(unittest.TestCase):
    def test_lock(self):
        from ops import LOCK_TTL, lock_free_for
        now = datetime(2026, 11, 16, tzinfo=UTC)
        self.assertTrue(lock_free_for(None, "a", now))
        self.assertTrue(lock_free_for({"instanceId": "a", "heartbeat": now}, "a", now))
        self.assertFalse(lock_free_for({"instanceId": "b", "heartbeat": now - timedelta(seconds=30)}, "a", now))
        self.assertTrue(lock_free_for({"instanceId": "b", "heartbeat": now - LOCK_TTL - timedelta(seconds=1)}, "a", now))
        self.assertTrue(lock_free_for({"instanceId": "b"}, "a", now))

    def test_health(self):
        import ops
        ops.STATE.role = "standby"
        self.assertEqual(ops.health_status(1000)[0], 200)
        ops.STATE.role, ops.STATE.last_ok = "active", 1000
        self.assertEqual(ops.health_status(1100)[0], 200)
        self.assertEqual(ops.health_status(1121)[0], 503)

    def test_self_check(self):
        from ops import self_check_problems
        self.assertEqual(self_check_problems(set(), 0, 0, 10), [])
        self.assertEqual(len(self_check_problems({"chat"}, 3, 10, 500)), 4)
        self.assertEqual(self_check_problems(set(), 2, 9, 100), [])


class RestoreDryRunTest(unittest.TestCase):
    def test_dry_run_reads_split_backup(self):
        import io, os, tempfile, contextlib
        from scripts.restore import main as restore_main
        t = datetime(2026, 11, 16, tzinfo=UTC)
        z = build_backup_zip({"centers": [{"id": "c1", "data": {}}], "users": [{"id": "u", "data": {}, SUB_KEY: {"children": [{"id": "k", "data": {}}]}}]}, t)
        with tempfile.TemporaryDirectory() as d:
            paths = []
            for i, part in enumerate(split_bytes(z, 200), 1):
                pth = os.path.join(d, f"b.zip.part{i}")
                open(pth, "wb").write(part)
                paths.append(pth)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                code = restore_main(list(reversed(paths)))  # tartib aralash bo'lsa ham
        self.assertEqual(code, 0)
        self.assertIn("centers: 1", out.getvalue())
        self.assertIn("ichki bilan 2", out.getvalue())
        self.assertIn("DRY-RUN", out.getvalue())


class ClaimTest(unittest.TestCase):
    NOW = datetime(2026, 11, 16, 12, tzinfo=UTC)

    def test_code_format(self):
        import random
        c = make_claim_code(random.Random(1))
        self.assertEqual(len(c), 6)
        self.assertTrue(all(ch in CODE_ALPHABET for ch in c))
        self.assertEqual(normalize_code(" ab-12 cd "), "AB12CD")

    def test_is_claimed_legacy(self):
        self.assertTrue(is_claimed({"ownerTgId": 5}))  # eski markaz: claimed maydoni yo'q
        self.assertFalse(is_claimed({"ownerTgId": None}))
        self.assertFalse(is_claimed({"claimed": False, "ownerTgId": None}))
        self.assertTrue(is_claimed({"claimed": True, "ownerTgId": 5}))

    def test_code_errors(self):
        ok_code = {"centerId": "c1", "expiresAt": self.NOW + timedelta(days=1), "usedBy": None}
        free = {"claimed": False, "ownerTgId": None}
        self.assertIsNone(claim_code_error(ok_code, free, self.NOW))
        self.assertIn("topilmadi", claim_code_error(None, free, self.NOW))
        self.assertIn("ishlatilgan", claim_code_error({**ok_code, "usedBy": 7}, free, self.NOW))
        self.assertIn("muddati", claim_code_error({**ok_code, "expiresAt": self.NOW - timedelta(seconds=1)}, free, self.NOW))
        self.assertIn("egasi", claim_code_error(ok_code, {"claimed": True, "ownerTgId": 9}, self.NOW))
        self.assertIn("Markaz topilmadi", claim_code_error(ok_code, None, self.NOW))


class BillingTest(unittest.TestCase):
    NOW = datetime(2026, 11, 16, 10, tzinfo=UTC)

    def center(self, **kw):
        base = {"approved": True, "ownerTgId": 5, "claimed": True, "createdAt": self.NOW - timedelta(days=10)}
        base.update(kw)
        return base

    def test_until_trial_from_claim(self):
        c = self.center(createdAt=self.NOW - timedelta(days=100), claimedAt=self.NOW - timedelta(days=2))
        self.assertEqual(billing_until(c), self.NOW + timedelta(days=28))  # egallangandan 30 kun bepul
        c2 = self.center(paidUntil=self.NOW + timedelta(days=60))
        self.assertEqual(billing_until(c2), self.NOW + timedelta(days=60))

    def test_reminders_3_and_1_day(self):
        c3 = self.center(paidUntil=self.NOW + timedelta(days=2, hours=5), createdAt=self.NOW - timedelta(days=90))
        self.assertEqual(billing_action(c3, self.NOW), ("remind", 3))
        c1 = self.center(paidUntil=self.NOW + timedelta(hours=20), createdAt=self.NOW - timedelta(days=90))
        self.assertEqual(billing_action(c1, self.NOW), ("remind", 1))
        c5 = self.center(paidUntil=self.NOW + timedelta(days=5), createdAt=self.NOW - timedelta(days=90))
        self.assertIsNone(billing_action(c5, self.NOW))

    def test_reminder_not_repeated(self):
        c = self.center(paidUntil=self.NOW + timedelta(days=2, hours=5), createdAt=self.NOW - timedelta(days=90))
        c["billingReminded"] = remind_key(c, 3)
        self.assertIsNone(billing_action(c, self.NOW))
        # to'lov qilinib, muddat uzaysa — yangi muddat uchun yana eslatiladi
        c["paidUntil"] = self.NOW + timedelta(days=30 + 2, hours=5)
        self.assertIsNone(billing_action(c, self.NOW))
        self.assertEqual(billing_action(c, self.NOW + timedelta(days=30)), ("remind", 3))

    def test_hide_after_7_days_and_unhide(self):
        c = self.center(paidUntil=self.NOW - timedelta(days=6), createdAt=self.NOW - timedelta(days=90))
        self.assertIsNone(billing_action(c, self.NOW))  # 6 kun — hali ko'rinadi
        c["paidUntil"] = self.NOW - timedelta(days=8)
        self.assertEqual(billing_action(c, self.NOW), ("hide", 8))
        c["hidden"] = True
        self.assertIsNone(billing_action(c, self.NOW))
        c["paidUntil"] = self.NOW + timedelta(days=30)
        self.assertEqual(billing_action(c, self.NOW), ("unhide", 0))

    def test_skips_unclaimed_and_pending(self):
        self.assertIsNone(billing_action(self.center(claimed=False, ownerTgId=None, createdAt=self.NOW - timedelta(days=90)), self.NOW))
        self.assertIsNone(billing_action(self.center(approved=False, createdAt=self.NOW - timedelta(days=90)), self.NOW))


class WeeklyTest(unittest.TestCase):
    NOW = datetime(2026, 11, 16, 4, tzinfo=UTC)  # dushanba 09:00 Toshkent

    def test_week_dates(self):
        cur, prev = week_dates(self.NOW), week_dates(self.NOW, 1)
        self.assertEqual(cur[0], "2026-11-09")
        self.assertEqual(cur[-1], "2026-11-15")
        self.assertEqual(prev[-1], "2026-11-08")
        self.assertEqual(len(set(cur) | set(prev)), 14)

    def test_sum_and_change(self):
        s = sum_stats([{"views": 3, "calls": 1}, {"views": 2, "apps": 1, "accepted": 1, "x": 9}])
        self.assertEqual(s, {"views": 5, "calls": 1, "routes": 0, "apps": 1, "accepted": 1})
        self.assertEqual(fmt_change(15, 10), "+50%")
        self.assertEqual(fmt_change(5, 10), "-50%")
        self.assertEqual(fmt_change(3, 0), "yangi")
        self.assertEqual(fmt_change(0, 0), "—")
        self.assertEqual(fmt_change(10, 10), "o‘zgarmadi")

    def test_tip(self):
        fresh = {"updatedAt": self.NOW, "groups": [{"freeSeats": 2}]}
        z = {"views": 0, "calls": 0, "routes": 0, "apps": 0, "accepted": 0}
        self.assertIn("yangilang", weekly_tip(z, {"updatedAt": self.NOW - timedelta(days=11)}, self.NOW))
        self.assertIn("0", weekly_tip(z, {"updatedAt": self.NOW, "groups": [{"freeSeats": 0}]}, self.NOW))
        self.assertIn("narx", weekly_tip({**z, "views": 20}, fresh, self.NOW))
        self.assertIn("QR", weekly_tip(z, fresh, self.NOW))


class QuickAddTest(unittest.TestCase):
    def test_latlng(self):
        self.assertEqual(parse_latlng("40.3567, 71.2845"), (40.3567, 71.2845))
        self.assertEqual(parse_latlng("https://www.google.com/maps/place/x/@40.3567,71.2845,17z"), (40.3567, 71.2845))
        self.assertEqual(parse_latlng("https://maps.google.com/?q=40.3567%2C71.2845"), (40.3567, 71.2845))
        self.assertEqual(parse_latlng("https://yandex.uz/maps/?ll=71.2845%2C40.3567&z=16"), (40.3567, 71.2845))
        self.assertIsNone(parse_latlng("Rishton markazi"))
        self.assertIsNone(parse_latlng("140.0000, 71.2845"))

    def test_subjects(self):
        known = ["Ingliz tili", "Matematika", "IT"]
        self.assertEqual(parse_subjects("ingliz tili, matem; IT, ingliz tili", known), ["Ingliz tili", "Matematika", "IT"])
        self.assertEqual(parse_subjects("-", known), [])
        self.assertEqual(parse_subjects("shaxmat", known), ["Shaxmat"])

    def test_campaign(self):
        self.assertEqual(campaign_slug("Flyer"), "flyer")
        self.assertIsNone(campaign_slug("bad slug!"))


if __name__ == "__main__":
    unittest.main()
