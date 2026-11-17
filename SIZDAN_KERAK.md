# YaqinDars — sizdan nima kerak

Kod tayyor. Quyidagilarni faqat **siz** qila olasiz (akkauntlar, kalitlar, qarorlar).
Tartib bilan bajaring — ☐ belgisini ☑ ga almashtirib boring.

---

## 0. Takomillashtirishdan keyin (16.11.2026) — yangi qadamlar

| # | Nima | Qayerda | Nega |
|---|---|---|---|
| ☐ A | **Groq kalitini almashtirish** | console.groq.com → API Keys → eski kalitni **Revoke**, yangisini yarating → `bot/.env` dagi `GROQ_API_KEY` (va Railway Variables) | Eski kalit bir marta `.env.example` orqali GitHub’ga tushishiga oz qolgan edi — xavfsizlik uchun almashtiring |
| ☐ B | **Firestore qoidalarini qayta joylash** | Firebase Console → Firestore → Rules → `firestore.rules` ni to‘liq qo‘yib **Publish** | Yangi kolleksiyalar: claimRequests, claimCodes, botRequests, centerStats, dailyStats, sourceStats, watches, watchDaily, ratings, reports, system, centers/*/photos (rasmlar) va profilni tahrirlash. Joylanmasa — egallash, QR, kuzatuv, shikoyat, statistika ishlamaydi |
| ☐ C | **Inline rejimni yoqish** | @BotFather → `/setinline` → @yaqindars_bot → `fan yoki markaz nomi` | `@yaqindars_bot ingliz` va ilovadagi rasmli «Ulashish» |
| ☐ D | **Main Mini App** | @BotFather → `/mybots` → bot → Bot Settings → **Configure Mini App** → Enable → Vercel manzili | `t.me/yaqindars_bot?startapp=c_…` (QR) va `?startapp=src_…` (kampaniya) havolalari to‘g‘ridan-to‘g‘ri ilovani ochishi uchun |
| ☐ E | **Railway’ga ko‘chirish** | README → «Railway — qadamma-qadam» | 24/7, `/health`, avtomatik qayta ishga tushish |
| ☐ F | **Kompyuterdagi botni to‘xtatish** | Railway logida «Yagona nusxa qulfi olindi» chiqqach | Ikkinchi nusxa baribir kutib turadi, lekin kompyuter resursini band qilmasin |
| ☐ G | **UptimeRobot** | README → «Monitoring: UptimeRobot» | Bot to‘xtasa 5 daqiqada xabar |
| ☐ H | **Kompyuterda bot ishlatsangiz** | `cd bot` → `venv\Scriptsctivate` → `pip install -U -r requirements.txt` | QR poster uchun `qrcode` va `Pillow` qo‘shildi |
| ☐ I | **Telefonda sinash** | README → ro‘yxatning 16–34 qadamlari | Yangi funksiyalar |
| ☐ J | **Bot @yaqindars kanalida admin bo‘lib qolsin** | Kanal → Administratorlar | Obunani tekshirish uchun shart (hozir admin — tekshirildi). Admin bo‘lmasa, bot hech kimni bloklamaydi |

---

## 1. Hozir qilish shart (busiz ilova to‘liq ishlamaydi)

| # | Nima | Qayerda | Nega |
|---|---|---|---|
| ☐ 1 | **Push qilishga ruxsat** — menga «push qil» deb yozing | — | Kodning oxirgi o‘zgarishlari hali GitHub’da yo‘q, Vercel eski versiyani ko‘rsatyapti |
| ☐ 2 | **Anonymous kirishni yoqish** | Firebase Console → Authentication → Sign-in method → Anonymous → Enable | Telegram orqali kirish, chat, kabinet, ariza holati shunga bog‘liq |
| ☐ 3 | **Firestore qoidalarini joylash** | Firebase Console → Firestore → Rules → `firestore.rules` faylidagi matnni to‘liq qo‘yib **Publish** | Qoidalar ko‘p o‘zgardi (kabinet, loglar, o‘chirish). Eskisi qolsa — ko‘p narsa rad etiladi |
| ☐ 4 | **Botni yangilash va qayta ishga tushirish** | `cd bot` → `venv\Scripts\activate` → `pip install -U -r requirements.txt` → `python main.py` | Yangi menyu, kabinet, o‘chirish, loglar, tozalash |
| ☐ 5 | **ADMIN_IDS to‘g‘riligini tekshirish** | Botga `/id` yozing → shu raqam `bot/.env` dagi `ADMIN_IDS` da bo‘lsin | Yangi markazlar, murojaatlar, `/logs` faqat adminga keladi |
| ☐ 6 | **Mini App manzili** | @BotFather → `/mybots` → bot → Bot Settings → Menu Button / Configure Mini App → Vercel manzili | Bot to‘g‘ri saytni ochishi uchun |

## 2. Bot 24/7 ishlashi uchun (kompyuter o‘chsa ham)

| # | Nima | Izoh |
|---|---|---|
| ☐ 7 | **Railway yoki Render akkaunti** | Railway osonroq. README → «Botni 24/7 ishlatish» bo‘limida qadam-baqadam |
| ☐ 8 | **Muhit o‘zgaruvchilarini kiritish** | `BOT_TOKEN`, `WEBAPP_URL` (Vercel manzili), `ADMIN_IDS`, `FIREBASE_CREDENTIALS_JSON` (serviceAccount.json ning **butun matni**) |
| ☐ 9 | **Kompyuterdagi botni o‘chirish** | Bir vaqtda faqat **bitta** bot ishlashi kerak, aks holda Telegram xato beradi |
| ☐ 10 | (ixtiyoriy) Indekslarni joylash | `npm i -g firebase-tools` → `firebase login` → `firebase deploy --only firestore` |

## 3. Haqiqiy telefonda tekshirish

| # | Nima | Izoh |
|---|---|---|
| ☐ 11 | **Android va iPhone’da sinash** | README → «Haqiqiy telefonda tekshirish ro‘yxati» (15 qadam) |
| ☐ 12 | **Muammo bo‘lsa — debug ma’lumoti** | Ilova manziliga `?debug=1` qo‘shib oching → «Nusxalash» → menga yuboring. Yoki botda `/logs` |

## 4. Hujjatlar va xavfsizlik

| # | Nima | Izoh |
|---|---|---|
| ☐ 13 | **Maxfiylik siyosati** | `webapp/public/privacy.html` — men yozgan **qoralama**. Yuristga ko‘rsating, rasmiy nom va aloqa ma’lumotini qo‘shing (yoki o‘z faylingizni qo‘ying) |
| ☐ 14 | **Kalitlarni sir saqlash** | `bot/.env` (bot tokeni) va `bot/serviceAccount.json` hech kimga berilmasin. Ular biror joyga tushib qolgan bo‘lsa — @BotFather `/revoke` va Firebase’da yangi kalit |
| ☐ 15 | **Haqiqiy markazlar** | Demo markazlar soxta. Markaz egalariga botni yuboring → `/markaz` → siz admin sifatida tasdiqlaysiz |

## 5. Sizning qaroringiz kerak (keyingi bosqich)

| # | Savol | Nima kerak bo‘ladi |
|---|---|---|
| ☐ 16 | **O‘rnatilgan ilovada (Telegram’siz) kirish** kerakmi? Hozir u yerda xarita va arizalar ishlaydi, lekin chat, kabinet va ariza holati — faqat Telegram ichida | «Telegram orqali kirish» (Login Widget): @BotFather → `/setdomain` → Vercel domeni. Keyin men ulayman |
| ☐ 17 | **To‘lov** (Payme / Click) avtomatik bo‘lsinmi? Hozir qo‘lda (`/vip`) | Payme yoki Click’da merchant akkaunt (yuridik shaxs/YaTT), ulardan kalitlar |
| ☐ 18 | **Haqiqiy AI yordamchi** kerakmi? Hozir oddiy qidiruv bilan javob beradi | LLM API kaliti va server (pullik) |
| ☐ 19 | **Rus tili** kerakmi? | Tarjima matnlari (yoki men tarjima qilaman, siz tekshirasiz) |
| ☐ 20 | **Sharhlar** (ota-onalar baho qo‘yishi) kerakmi? | Qoidalar: kim sharh yoza oladi (masalan, faqat qabul qilingan arizasi borlar) |
| ☐ 21 | (ixtiyoriy) **O‘z domeningiz** (masalan yaqindars.uz) | Domen sotib olish → Vercel → Settings → Domains |

---

**Eng qisqa yo‘l:** 1 → 2 → 3 → 4 → 6 → telefonda sinash (11). Qolganlari keyin.
