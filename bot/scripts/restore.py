"""Zaxira nusxadan Firestore'ni tiklash.

Standart holatda — QURUQ SINOV (dry-run): hech narsa yozilmaydi, faqat nima tiklanishini ko'rsatadi.

  python scripts/restore.py yaqindars_2026-11-16_0300.zip
  python scripts/restore.py yaqindars_...zip.part1 yaqindars_...zip.part2      # bo'laklangan nusxa
  python scripts/restore.py nusxa.zip --only centers                         # faqat bitta kolleksiya
  python scripts/restore.py nusxa.zip --apply                                # HAQIQATDAN yozish

--apply mavjud hujjatlarni zaxiradagi holat bilan ALMASHTIRADI (zaxirada yo'q hujjatlar o'chirilmaydi).
Firebase kaliti: .env dagi FIREBASE_CREDENTIALS (yoki FIREBASE_CREDENTIALS_JSON).
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from logic import SUB_KEY, from_jsonable, read_backup_zip  # noqa: E402


def count_docs(docs: list[dict]) -> int:
    return sum(1 + sum(count_docs(sub) for sub in d.get(SUB_KEY, {}).values()) for d in docs)


def write_docs(db, col_ref, docs: list[dict], batch_holder: list) -> int:
    n = 0
    for d in docs:
        ref = col_ref.document(d["id"])
        batch_holder[0].set(ref, from_jsonable(d.get("data", {})))
        batch_holder[1] += 1
        n += 1
        if batch_holder[1] >= 400:
            batch_holder[0].commit()
            batch_holder[0], batch_holder[1] = db.batch(), 0
        for sub_name, sub_docs in d.get(SUB_KEY, {}).items():
            n += write_docs(db, ref.collection(sub_name), sub_docs, batch_holder)
    return n


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="YaqinDars zaxira nusxasidan tiklash")
    ap.add_argument("files", nargs="+", help="zip yoki uning .partN bo'laklari (tartib bilan)")
    ap.add_argument("--only", action="append", help="faqat shu kolleksiya(lar)")
    ap.add_argument("--apply", action="store_true", help="haqiqatdan yozish (standart — dry-run)")
    ap.add_argument("--yes", action="store_true", help="tasdiqlash so'ramasin")
    args = ap.parse_args(argv)

    files = sorted(args.files, key=lambda f: (len(f), f)) if any(".part" in f for f in args.files) else args.files
    data = b"".join(open(f, "rb").read() for f in files)
    manifest, cols = read_backup_zip(data)
    if args.only:
        unknown = set(args.only) - set(cols)
        if unknown:
            print("Zaxirada yo'q kolleksiya:", ", ".join(unknown))
            return 2
        cols = {k: v for k, v in cols.items() if k in args.only}

    print(f"Zaxira sanasi: {manifest.get('created')}")
    for name, docs in cols.items():
        sample = ", ".join(d["id"] for d in docs[:3])
        print(f"  {name}: {len(docs)} hujjat (ichki bilan {count_docs(docs)})" + (f" — {sample}…" if sample else ""))

    if not args.apply:
        print("\nDRY-RUN: hech narsa yozilmadi. Haqiqatdan tiklash uchun --apply qo'shing.")
        return 0

    if not args.yes and input("\nFirestore'ga yozilsinmi? Mavjud hujjatlar almashtiriladi. «HA» deb yozing: ").strip() != "HA":
        print("Bekor qilindi.")
        return 1

    from dotenv import load_dotenv
    import firebase_admin
    from firebase_admin import credentials, firestore

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
    cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "").strip()
    cred_path = os.getenv("FIREBASE_CREDENTIALS", "serviceAccount.json")
    firebase_admin.initialize_app(credentials.Certificate(json.loads(cred_json) if cred_json else cred_path))
    db = firestore.client()
    holder = [db.batch(), 0]
    total = 0
    for name, docs in cols.items():
        total += write_docs(db, db.collection(name), docs, holder)
    if holder[1]:
        holder[0].commit()
    print(f"Tiklandi: {total} hujjat.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
