# YaqinDars — Telegram Mini App + Bot + Firebase

Ota-onalar va o‘quvchilarga uyiga yaqin o‘quv markazlari, to‘garaklar va repetitorlarni xaritada topishga yordam beradigan servis.
Birinchi hudud — Rishton tumani.

```
yaqindars/
├── webapp/            ← Telegram Mini App (HTML + CSS + vanilla JS, build tizimisiz)
│   ├── index.html
│   ├── style.css
│   ├── app.js         ← xarita (Leaflet + OSM), filtrlar, kartochka, ariza formasi
│   ├── config.js      ← FIREBASE_CONFIG shu yerga qo‘yiladi (null = DEMO rejim)
│   └── demo.js        ← 6 ta namuna markaz
├── bot/               ← Telegram bot (Python 3.11+, aiogram 3, polling)
│   ├── main.py
│   ├── parsers.py     ← kun / vaqt / narx / telefon parserlari
│   ├── test_parsers.py
│   ├── seed_demo.py   ← Firestore’ga demo markazlar yozish / o‘chirish
│   ├── requirements.txt
│   └── .env.example
├── firestore.rules    ← Firestore xavfsizlik qoidalari
└── .gitignore         ← .env va serviceAccount.json GitHub’ga tushmasligi uchun
```

## Nima qila oladi

**Ota-ona / o‘quvchi (Mini App):**
- Xaritada markazlar: moviy — oddiy, oltin va kattaroq — VIP, kulrang — mos guruhlarda bo‘sh joy yo‘q; ko‘k nuqta — siz
- Fan chiplari, «Faqat bo‘sh joy», Filtr oynasi (oylik narx, dars kunlari) — ro‘yxat va markerlar birga yangilanadi
- Saralash: avval VIP, keyin masofa bo‘yicha
- Markaz kartochkasi: manzil, masofa, reyting, «Yangilangan: N kun oldin», sharoitlar, guruhlar
- 14 kundan beri yangilanmagan markazda: «Ma’lumot eskirgan bo‘lishi mumkin — yozilishdan oldin qo‘ng‘iroq qiling»
- «Qo‘ng‘iroq» va «Yo‘l ko‘rsatish» (Yandex Xarita)
- «Bepul sinov darsiga yozilish» — ariza markaz egasiga botda keladi

**Markaz egasi (bot, /markaz):**
- Ro‘yxatdan o‘tish: nom → manzil → joylashuv → telefon → sharoitlar
- Guruh qo‘shish: fan → kunlar → vaqt → narx → bo‘sh joy
- ➖ / ➕ bilan bo‘sh joyni bir bosishda o‘zgartirish, narxni yangilash, guruhni o‘chirish
- Yangi arizalar darhol botga keladi
- 7 kun yangilanmasa — bot «Bo‘sh joylar va narxlar hali to‘g‘rimi?» deb so‘raydi

**Admin:**
- Yangi markazni tasdiqlash / rad etish (tugmalar bilan, joylashuv ham keladi)
- `/vip MARKAZ_ID` — VIP ni yoqish/o‘chirish
- `/stat` — markazlar, tasdiqlanganlar, VIP va arizalar soni

**Biznes-model:** ota-onalar uchun bepul; markazlar uchun 1-oy bepul, keyin Oddiy — 75 000 so‘m/oy,
VIP — 150 000 so‘m/oy. To‘lov hozircha qo‘lda (admin `/vip` bilan yoqadi), avtomatik to‘lov — keyingi bosqichda.

---

## 0. DEMO’ni kompyuterda ochish (5 daqiqa)

`webapp/config.js` da `FIREBASE_CONFIG = null` bo‘lsa, ilova 6 ta namuna markaz bilan ishlaydi
va tepada «DEMO rejim» banneri chiqadi. Faylni to‘g‘ridan-to‘g‘ri ochib bo‘lmaydi (ES modullar server talab qiladi):

```bash
cd webapp
python -m http.server 8080
# brauzerda: http://localhost:8080  (telefon o‘lchamini ko‘rish uchun F12 → qurilma rejimi)
```

DEMO’da ariza hech qayerga yuborilmaydi — faqat «DEMO: ariza qabul qilindi» xabari chiqadi.

## 1. Telegram bot yaratish

1. Telegram’da **@BotFather** → `/newbot` → nom (masalan `YaqinDars`) va username (masalan `YaqinDarsBot`).
2. Berilgan **tokenni** saqlang. Token — parol: uni hech kimga bermang va GitHub’ga yuklamang.
   Agar token qayerdadir oshkor bo‘lsa — @BotFather → `/revoke` bilan yangisini oling.

## 2. Firebase sozlash

1. https://console.firebase.google.com → **Add project** → nom: `yaqindars` (Google Analytics shart emas).
2. **Build → Firestore Database → Create database** → joylashuv: `europe-west` (yoki yaqinrog‘i) → **Production mode**.
3. **Firestore → Rules** bo‘limiga `firestore.rules` faylidagi matnni to‘liq qo‘yib, **Publish** bosing.
4. **Project settings (⚙) → General → Your apps → Web (`</>`)** → ilova qo‘shing (Hosting shart emas) →
   ko‘rsatilgan `firebaseConfig` obyektini `webapp/config.js` ga qo‘ying:
   ```js
   export const FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "yaqindars.firebaseapp.com",
     projectId: "yaqindars",
     storageBucket: "yaqindars.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```
   Bu kalit ochiq bo‘lishi normal — himoyani `firestore.rules` ta’minlaydi.
5. **Project settings → Service accounts → Generate new private key** → yuklangan JSON faylni
   `bot/serviceAccount.json` deb saqlang. ⚠️ Bu fayl bazaga TO‘LIQ ruxsat beradi — hech kimga bermang,
   GitHub’ga yuklamang (`.gitignore` da bor).

## 3. Mini App’ni joylash (HTTPS shart)

**GitHub Pages:**
1. GitHub’da yangi repo oching (masalan `yaqindars`) va loyihani yuklang
   (`.gitignore` tufayli `.env` va `serviceAccount.json` yuklanmaydi — `git status` bilan tekshiring).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch** → Branch: `main`, papka: `/ (root)` → Save.
3. Bir-ikki daqiqadan keyin Mini App manzili: `https://USERNAME.github.io/yaqindars/webapp/` — shu **WEBAPP_URL**.

**Vercel (muqobil):** vercel.com → Add New Project → repo’ni tanlang → **Root Directory: `webapp`** →
Framework: Other → Deploy. Manzil: `https://yaqindars.vercel.app/`.

`config.js` ni o‘zgartirsangiz — qayta yuklang (push), bot va Telegram o‘zi yangi versiyani oladi
(Telegram keshlagan bo‘lsa, Mini App’ni yopib qayta oching).

## 4. Botni ishga tushirish

```bash
cd bot
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # Windows: copy .env.example .env
```

`.env` ni to‘ldiring:

| O‘zgaruvchi | Ma’nosi |
|---|---|
| `BOT_TOKEN` | @BotFather bergan token |
| `WEBAPP_URL` | 3-bosqichdagi HTTPS manzil |
| `ADMIN_IDS` | admin(lar) Telegram ID si, vergul bilan. ID’ni bilish: botni ishga tushirib `/id` yozing |
| `FIREBASE_CREDENTIALS` | `serviceAccount.json` yo‘li |

```bash
python main.py
```

Bot ishga tushganda menyu tugmasi «Xarita» va buyruqlar ro‘yxati avtomatik o‘rnatiladi.
Biror sozlama noto‘g‘ri bo‘lsa, bot nima yetishmayotganini o‘zbekcha yozib to‘xtaydi.

Demo markazlarni Firestore’ga yozish (egasi — siz, `/markaz` da boshqara olasiz):

```bash
python seed_demo.py SIZNING_TELEGRAM_ID
python seed_demo.py --delete       # o‘chirish
```

**Serverga qo‘yish:** bot doim ishlab turishi kerak — arzon VPS (`systemd` yoki `screen`), Railway yoki Render.
Railway’da: repo’ni ulang → Root Directory `bot` → Start command `python main.py` → `.env` qiymatlarini
Variables’ga kiriting, `serviceAccount.json` ni esa fayl sifatida emas, maxfiy o‘zgaruvchi orqali bering
(yoki VPS’da faylni `scp` bilan yuklang). Bot faqat **bitta nusxada** ishlashi kerak (polling).

## 5. Tekshirish

**Avtomatik:**
```bash
cd bot && python -m unittest test_parsers -v      # kun / vaqt / narx / telefon parserlari
python -m py_compile main.py seed_demo.py parsers.py
cd ../webapp && node --input-type=module --check < app.js
```

**Qo‘lda (haqiqiy token va Firebase bilan):**
1. Botga `/start` → «🗺 Xaritani ochish» → xarita ochiladi (DEMO banner yo‘q).
2. `/markaz` → «Markazni ro‘yxatdan o‘tkazish» → nom, manzil, joylashuv, telefon, sharoitlar.
3. Admin akkauntiga «🆕 Yangi markaz» xabari va joylashuv keladi → «✅ Tasdiqlash».
4. Egaga «Markazingiz tasdiqlandi» keladi → `/markaz` → «➕ Guruh qo‘shish»
   (kunlar: `Du, Ch, Ju` yoki `dushanba, juma`; vaqt: `16:00-17:30` yoki `9.00 – 10.30`).
5. Mini App’ni qayta oching → markaz xaritada ko‘rinadi.
6. «Bepul sinov darsiga yozilish» → ism va telefon → «Ariza yuborildi!» →
   markaz egasiga botda «🔔 Yangi ariza» keladi (ism, telefon, @username, guruh).
7. ➖ / ➕ bosing → Mini App’ni qayta ochsangiz bo‘sh joy soni o‘zgargan.

## Ma’lumotlar tuzilmasi (Firestore)

`centers/{id}` — faqat bot yozadi
```
name, address, lat, lng, phone (+998XXXXXXXXX), amenities: string[],
vip: bool, rating: number|null, approved: bool,
ownerTgId: number, ownerUsername, createdAt, updatedAt, lastReminderAt,
groups: [{ subject, days: ["Du","Ch","Ju"], time: "16:00–17:30", price: number, freeSeats: number }]
```

`applications/{id}` — Mini App faqat yaratadi, bot o‘qiydi
```
centerId, centerName, group (matn), name, phone, tgUserId, tgUsername,
createdAt (serverTimestamp), notified: false, status: "new"
```

Kunlar: `Du Se Ch Pa Ju Sh Ya`. Fanlar: Ingliz tili, Matematika, IT, Rus tili, Kimyo, Biologiya, Fizika, Ona tili, Sport, Boshqa
(«Boshqa» tanlansa — fan nomi qo‘lda yoziladi).

## Qabul qilingan qarorlar (vazifada aniq ko‘rsatilmagan joylar)

- **Kun filtri:** guruhning *barcha* dars kunlari tanlangan kunlar ichida bo‘lsa mos keladi
  (masalan, Du+Ju tanlansa, Du/Ch/Ju guruhi chiqmaydi).
- **Kulrang marker:** filtrga mos guruhlarning hammasida bo‘sh joy 0 bo‘lsa.
- **Narx ko‘rsatkichi:** kartochkada filtrga mos guruhlarning eng arzon narxi («… so‘m dan»).
- **Filtr hisoblagichi:** narx va kunlar (filtr oynasidagi) bo‘yicha; fan chipi va «Faqat bo‘sh joy» alohida ko‘rinib turadi.
- **Telefon:** `+998 90 123 45 67`, `998901234567` va `90 123 45 67` (9 raqam) shakllari qabul qilinadi.
- **Guruh vaqti:** tugash vaqti boshlanishdan keyin bo‘lishi shart.
- **Ariza qoidasi:** ariza faqat mavjud va tasdiqlangan markazga yaratiladi (`firestore.rules` da `get()` tekshiruvi).
- **Takroriy xabar yo‘q:** bot arizani tranzaksiya bilan «notified=true» qiladi — qayta ulanishda ham ikki marta yubormaydi.
- **Guruhlarni o‘zgartirish** tranzaksiya ichida va har safar egasi tekshiriladi.
- **Rad etilgan markaz** bazadan o‘chiriladi, egaga xabar boradi.
- **/id** buyrug‘i qo‘shildi — `ADMIN_IDS` ni sozlashni osonlashtiradi.
- Telegram’dan tashqarida (oddiy brauzerda) Telegram funksiyalari (BackButton, haptic) chaqirilmaydi; Esc tugmasi oynani yopadi.

## Keyingi bosqich (reja)

- **Spamdan himoya:** arizani to‘g‘ridan-to‘g‘ri Firestore’ga emas, Telegram `initData` imzosini tekshiradigan
  Cloud Function orqali qabul qilish; keyin `applications` ga create qoidasini yopish.
- **To‘lov:** Payme / Click orqali obuna (Oddiy 75 000, VIP 150 000 so‘m), muddati tugaganda markazni yashirish.
- **Reyting:** sinov darsidan 2–3 kun keyin bot ota-onadan baho so‘raydi → `rating` hisoblanadi.
- **Xarita plitkalari:** OpenStreetMap’ning bepul serveri katta yuklama uchun emas — foydalanuvchilar
  ko‘paysa MapTiler / Stadia / Yandex plitkalariga o‘tish (`app.js` dagi `L.tileLayer` manzili).
- **Android ilova:** Flutter’da, xuddi shu Firestore bazasi bilan.
- Arizalar holatini (`status`: new → called → enrolled) botda boshqarish, markaz uchun oylik hisobot.

---

## Telegram orqali kirish, chat va bildirishnomalar (server shart emas)

Cloud Functions (pullik Blaze tarif) o‘rniga **bot o‘zi** foydalanuvchini tasdiqlaydi:

1. Mini App Firebase’ga **anonim** kiradi va Telegram `initData`’sini `tgLinks/{uid}` ga yozadi.
2. Bot imzoni bot tokeni bilan tekshiradi (`parsers.validate_init_data`) va akkauntga `tg` (Telegram ID) claim’ini qo‘yadi.
3. `firestore.rules` shu claim bo‘yicha har kimga faqat o‘z profili, arizalari va chatlarini ochadi.

Shu orqali ishlaydi: markaz bilan chat (javoblar botda «↩️ Javob berish» tugmasi bilan), ariza holati
(markaz egasi botda «👁 Ko‘rdim / ✅ Qabul / ❌ Rad» bosadi, ota-onaga xabar boradi, sinov darsi sanasi
avtomatik hisoblanadi), «Joy bo‘shasa xabar ber», sinov darsidan 24 soat oldin eslatma, profil bulutda.

**Bir martalik sozlash:**
1. Firebase Console → **Authentication → Sign-in method → Anonymous → Enable**.
2. Firebase Console → **Firestore → Rules** → `firestore.rules` matnini qo‘yib **Publish**.
3. Botni qayta ishga tushiring. Bot ishga tushganda o‘z username’ini `meta/public` ga yozadi —
   web app «Ulashish» havolalari uchun shuni ishlatadi.

Bot o‘chiq bo‘lsa, Mini App 10 soniyadan keyin mehmon rejimida ochiladi (xarita va arizalar ishlaydi).
AI yordamchi hozircha qoidaga asoslangan qidiruv bilan ishlaydi (LLM uchun server kerak).

---

## Botni 24/7 ishlatish (Railway yoki Render)

Bot polling rejimida ishlaydi: **bir vaqtda faqat bitta nusxa** ishlashi kerak (kompyuterdagi botni o‘chiring).
Maxfiy fayllar konteynerga kirmaydi (`bot/.dockerignore`) — hammasi muhit o‘zgaruvchilari orqali beriladi:

| O‘zgaruvchi | Qiymat |
|---|---|
| `BOT_TOKEN` | @BotFather tokeni |
| `WEBAPP_URL` | Vercel manzili, masalan `https://yaqindars.vercel.app/` |
| `ADMIN_IDS` | admin Telegram ID(lar)i, vergul bilan |
| `FIREBASE_CREDENTIALS_JSON` | `serviceAccount.json` faylining **butun matni** (bitta qatorga) |
| `LOG_LEVEL` | ixtiyoriy: `INFO` (standart) yoki `DEBUG` |

**Railway** (oddiyroq): railway.com → New Project → Deploy from GitHub repo → `yaqindars` →
Settings → **Root Directory: `bot`** (`bot/railway.json` va `Dockerfile` o‘zi topiladi) → Variables bo‘limiga
yuqoridagilarni kiriting → Deploy. `restartPolicyType: ALWAYS` — bot yiqilsa avtomatik qayta ishga tushadi.
Loglar: servis → **Deployments → View Logs**.

**Render**: render.com → New → **Blueprint** → repo’ni tanlang (`render.yaml` o‘qiladi) → o‘zgaruvchilarni
kiriting → Apply. Background Worker pullik (Starter). Loglar: servis → **Logs**.

**Istalgan VPS (Docker):**
```bash
cd bot
docker build -t yaqindars-bot .
docker run -d --name yaqindars-bot --restart unless-stopped --env-file .env \
  -e FIREBASE_CREDENTIALS_JSON="$(cat serviceAccount.json)" yaqindars-bot
docker logs -f yaqindars-bot
```

Har push’da Railway/Render botni o‘zi qayta joylaydi. Xatolar loglarda va Firestore’dagi `logs` kolleksiyasida ko‘rinadi.

---

## Firestore indekslari (`firestore.indexes.json`)

Ilova va botdagi **barcha** so‘rovlar bitta maydonli (tenglik, bitta diapazon yoki bitta `orderBy`) — ular uchun
Firestore indeksni avtomatik yaratadi, shuning uchun **kompozit indeks kerak emas** (`"indexes": []`).

| Kolleksiya | So‘rov | Kim |
|---|---|---|
| `centers` | `approved == true` · `ownerTgId == X` | ilova, bot |
| `applications` | `tgUserId == X` · `centerId == X` · `notified == false` · `status == "accepted"` · `statusBy == "web"` · `createdAt < T` | ilova, bot |
| `chats` | `userTgId == X` · `unreadCenter > 0` | ilova, bot |
| `chats/*/messages` | `orderBy(createdAt)` · `notified == false` | ilova, bot |
| `waitlist` | `centerId == X` · `userTgId == X` | bot |
| `tgLinks` | `status == "pending"` · `tg == X` | bot |
| `deleteRequests` | `status == "pending"` | bot |
| `logs` | `createdAt < T` · `orderBy(createdAt desc)` | bot |

`fieldOverrides` — katta matnli maydonlar (initData, xato stack’i, xabar matni, tavsif, guruhlar ro‘yxati)
indeksdan chiqarilgan: ular bo‘yicha qidiruv yo‘q, indekslash esa yozishni sekinlashtiradi va pul turadi.
Yangi **ikki maydonli** so‘rov qo‘shilsa (masalan `where(a) + orderBy(b)`), indeksni shu faylga qo‘shing.

Joylash (Firebase CLI bilan): `firebase deploy --only firestore` — qoidalar va indekslar birga.
Yoki qoidalarni Console → Firestore → Rules orqali qo‘lda qo‘ying.

---

## Haqiqiy telefonda tekshirish ro‘yxati (Android va iPhone)

Har relizdan oldin **ikkala** telefonda o‘ting. Muammo bo‘lsa, ilovani `?debug=1` bilan oching
(masalan BotFather’dagi Mini App manziliga vaqtincha qo‘shing) va panelni «Nusxalash» bilan yuboring.

| # | Qadam | Kutilgan natija | Android | iPhone |
|---|---|---|---|---|
| 1 | Botga `/start` | Ism bilan salom, 2 ta rangli tugma (yashil/ko‘k) va pastki menyu | ☐ | ☐ |
| 2 | «🚀 Telegramda ochish» | Ilova to‘liq ekranda ochiladi, oq «miltillash» yo‘q | ☐ | ☐ |
| 3 | 4–5 s kuting | «Ilovani telefoningizga o‘rnatasizmi?» → «Ha» → bosh ekranga qo‘shiladi; qayta ochilganda so‘ramaydi | ☐ | ☐ |
| 4 | Xarita tabi | Plitkalar **butun** ekranni to‘ldiradi (kulrang joy yo‘q), aylantirganda ham | ☐ | ☐ |
| 5 | Joylashuv | Ruxsat so‘raladi → ko‘k nuqta va aniqlik doirasi; rad etilsa — Rishton + «Joylashuvni yoqish» | ☐ | ☐ |
| 6 | Markaz → «Bepul sinov darsi» → yuborish | «Ariza yuborildi»; Profil → Arizalarim’da ko‘rinadi | ☐ | ☐ |
| 7 | Markaz egasining Telegram’i | «🔔 Yangi ariza» xabari, holat tugmalari bilan | ☐ | ☐ |
| 8 | Ega «✅ Qabul qilish» bosadi (yoki kabinetda «Qabul») | Ota-onaga «✅ … qabul qildi» + sinov darsi sanasi; ilovada holat yangilanadi | ☐ | ☐ |
| 9 | Markaz sahifasi → «Yozish» → xabar | Egaga botda keladi; «↩️ Javob berish» → javob ilovada va Telegram’da | ☐ | ☐ |
| 10 | `/markaz` → «📝 Markazni qo‘shish» → oxirigacha | Bot «✅ qabul qilindi» deydi, admin’ga xabar keladi | ☐ | ☐ |
| 11 | «🎓 Ta’lim beruvchi bo‘lib kirish» → «Kabinetni ochish» | Markaz, arizalar, guruhlar; ➖/➕ xaritada darhol ko‘rinadi | ☐ | ☐ |
| 12 | Bot o‘chiq holda ilovani oching | 10 s ichida «Server bilan aloqa yo‘q» + «Qayta urinish» | ☐ | ☐ |
| 13 | Profil → «Ma’lumotlarimni o‘chirish» (yoki `/delete`) | Tasdiqlash oynasi → hammasi o‘chadi, botdan xabar keladi | ☐ | ☐ |
| 14 | Profil → «Maxfiylik siyosati» | `/privacy` sahifasi ochiladi | ☐ | ☐ |
| 15 | Qorong‘i mavzu (Telegram sozlamasi) | Matnlar o‘qiladi, banner ranglari o‘zgarmaydi | ☐ | ☐ |
