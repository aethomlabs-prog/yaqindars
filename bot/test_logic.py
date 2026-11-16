"""Yangi mantiq testlari:  python -m unittest test_logic -v   (bot/ papkasida)"""
import unittest
from datetime import datetime, timedelta, timezone

from logic import (
    SUB_KEY,
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


if __name__ == "__main__":
    unittest.main()
