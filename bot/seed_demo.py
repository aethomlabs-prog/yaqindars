"""Firestore'ga namuna (demo) markazlarni yozadi — sinash uchun.

Ishlatish:  python seed_demo.py <SIZNING_TELEGRAM_ID>
Shunda demo markazlarning egasi siz bo'lasiz va /markaz da ularni boshqara olasiz.
O'chirish:  python seed_demo.py --delete
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import firebase_admin
from dotenv import load_dotenv
from firebase_admin import credentials, firestore

DAY = timedelta(days=1)

# (id, nom, manzil, lat, lng, vip, reyting, sharoitlar, necha kun oldin yangilangan, guruhlar)
DEMO = [
    ("demo1", "Namuna: Bilimdon markazi", "Rishton, Mustaqillik ko‘chasi (namuna)", 40.3592, 71.2861, True, 4.8,
     ["Wi-Fi", "Konditsioner", "Kompyuter xonasi"], 1, [
         ("Ingliz tili", ["Du", "Ch", "Ju"], "16:00–17:30", 300000, 3),
         ("Matematika", ["Se", "Pa", "Sh"], "15:00–16:30", 250000, 0),
     ]),
    ("demo2", "Namuna: IT Akademiya", "Rishton, Navoiy ko‘chasi (namuna)", 40.3541, 71.2795, False, 4.6,
     ["Wi-Fi", "Kompyuter xonasi"], 3, [
         ("IT", ["Du", "Ch", "Ju"], "14:00–16:00", 400000, 5),
         ("IT", ["Se", "Pa"], "17:00–19:00", 350000, 1),
     ]),
    ("demo3", "Namuna: Kimyo-Biologiya", "Rishton, Bog‘ ko‘chasi (namuna)", 40.3615, 71.2932, False, 4.5,
     ["Konditsioner"], 20, [  # eskirgan (20 kun)
         ("Kimyo", ["Se", "Pa", "Sh"], "09:00–10:30", 220000, 2),
         ("Biologiya", ["Du", "Ch"], "11:00–12:30", 220000, 4),
     ]),
    ("demo4", "Namuna: Rus tili kursi", "Rishton, Tinchlik ko‘chasi (namuna)", 40.3518, 71.2899, False, 4.3,
     ["Wi-Fi"], 2, [  # joy yo'q
         ("Rus tili", ["Du", "Ch", "Ju"], "15:00–16:00", 180000, 0),
     ]),
    ("demo5", "Namuna: Sport to‘garagi", "Rishton, stadion yonida (namuna)", 40.3640, 71.2810, False, 4.7,
     ["Kiyinish xonasi"], 5, [
         ("Sport", ["Se", "Pa", "Sh"], "17:00–18:30", 150000, 8),
     ]),
    ("demo6", "Namuna: Matematika repetitor", "Rishton, Yoshlik mahallasi (namuna)", 40.3570, 71.2760, True, 4.9,
     ["Kichik guruh (6 kishi)"], 1, [
         ("Matematika", ["Du", "Ch", "Ju"], "18:00–19:30", 350000, 2),
         ("Fizika", ["Se", "Pa"], "18:00–19:30", 300000, 1),
     ]),
]


def main():
    if len(sys.argv) < 2 or not (sys.argv[1] == "--delete" or sys.argv[1].isdigit()):
        print(__doc__)
        sys.exit(1)

    load_dotenv()
    firebase_admin.initialize_app(credentials.Certificate(os.getenv("FIREBASE_CREDENTIALS", "serviceAccount.json")))
    centers = firestore.client().collection("centers")

    if sys.argv[1] == "--delete":
        for cid, *_ in DEMO:
            centers.document(cid).delete()
        print(f"{len(DEMO)} ta demo markaz o‘chirildi.")
        return

    owner = int(sys.argv[1])
    now = datetime.now(timezone.utc)
    for i, (cid, name, address, lat, lng, vip, rating, amen, age_days, groups) in enumerate(DEMO, 1):
        centers.document(cid).set({
            "name": name, "address": address, "lat": lat, "lng": lng,
            "phone": f"+99890000000{i}", "amenities": amen, "vip": vip, "rating": rating,
            "approved": True, "ownerTgId": owner, "ownerUsername": None,
            "groups": [{"subject": s, "days": d, "time": t, "price": p, "freeSeats": f} for s, d, t, p, f in groups],
            "createdAt": now - age_days * DAY, "updatedAt": now - age_days * DAY, "lastReminderAt": None,
        })
    print(f"{len(DEMO)} ta demo markaz yozildi. Egasi: {owner}")


if __name__ == "__main__":
    main()
