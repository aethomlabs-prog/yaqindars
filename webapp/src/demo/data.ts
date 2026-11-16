// DEMO uchun namuna ma’lumotlar (haqiqiy markazlar emas). Rishton markazi atrofida.
import type { Center, Chat, Message, Review } from "../lib/types";

const DAY = 86400000;
const now = Date.now();

type Raw = Omit<Center, "reviewsCount" | "photoUrl" | "kind" | "updatedMs" | "description" | "ageFrom" | "ageTo" | "teachers" | "claimed" | "verified" | "verifiedMs"> &
  Partial<Center> & { age?: number };

function c(x: Raw & { daysOld: number }): Center {
  return {
    reviewsCount: 0,
    photoUrl: null,
    kind: "center",
    description: "",
    ageFrom: null,
    ageTo: null,
    teachers: [],
    claimed: true,
    verified: ["demo1", "demo6", "demo9"].includes(x.id),
    verifiedMs: now - 20 * DAY,
    ...x,
    updatedMs: now - x.daysOld * DAY
  };
}

const BASE_CENTERS: Center[] = [
  c({
    id: "demo1", name: "Namuna: Bilimdon markazi", address: "Rishton, Mustaqillik ko‘chasi 12", lat: 40.3592, lng: 71.2861,
    phone: "+998900000001", vip: true, rating: 4.8, reviewsCount: 36, daysOld: 1, ageFrom: 7, ageTo: 17,
    amenities: ["Wi-Fi", "Konditsioner", "Kompyuter xonasi"],
    description: "Ingliz tili va matematika bo‘yicha 8 yillik tajriba. Guruhlar 10 kishigacha, har oy ota-onalar uchun hisobot.",
    groups: [
      { subject: "Ingliz tili", days: ["Du", "Ch", "Ju"], time: "16:00–17:30", price: 300000, freeSeats: 3 },
      { subject: "Matematika", days: ["Se", "Pa", "Sh"], time: "15:00–16:30", price: 250000, freeSeats: 0 }
    ]
  }),
  c({
    id: "demo2", name: "Namuna: IT Akademiya", address: "Rishton, Navoiy ko‘chasi 5", lat: 40.3541, lng: 71.2795,
    phone: "+998900000002", vip: false, rating: 4.6, reviewsCount: 18, daysOld: 3, ageFrom: 10, ageTo: 18,
    amenities: ["Wi-Fi", "Kompyuter xonasi"],
    description: "Dasturlash asoslari, Python va veb-sayt yaratish. Har bir o‘quvchiga alohida kompyuter.",
    groups: [
      { subject: "IT", days: ["Du", "Ch", "Ju"], time: "14:00–16:00", price: 400000, freeSeats: 5 },
      { subject: "IT", days: ["Se", "Pa"], time: "17:00–19:00", price: 350000, freeSeats: 1 }
    ]
  }),
  c({
    id: "demo3", name: "Namuna: Kimyo-Biologiya", address: "Rishton, Bog‘ ko‘chasi 3", lat: 40.3615, lng: 71.2932,
    phone: "+998900000003", vip: false, rating: 4.5, reviewsCount: 9, daysOld: 20, ageFrom: 13, ageTo: 18,
    amenities: ["Konditsioner", "Laboratoriya"],
    description: "Abituriyentlar uchun kimyo va biologiya. Test tayyorgarligi.",
    groups: [
      { subject: "Kimyo", days: ["Se", "Pa", "Sh"], time: "09:00–10:30", price: 220000, freeSeats: 2 },
      { subject: "Biologiya", days: ["Du", "Ch"], time: "11:00–12:30", price: 220000, freeSeats: 4 }
    ]
  }),
  c({
    id: "demo4", name: "Namuna: Rus tili kursi", address: "Rishton, Tinchlik ko‘chasi 8", lat: 40.3518, lng: 71.2899,
    phone: "+998900000004", vip: false, rating: 4.3, reviewsCount: 5, daysOld: 2, ageFrom: 6, ageTo: 14,
    amenities: ["Wi-Fi"],
    description: "Rus tilida erkin so‘zlashish, kichik guruhlar.",
    groups: [{ subject: "Rus tili", days: ["Du", "Ch", "Ju"], time: "15:00–16:00", price: 180000, freeSeats: 0 }]
  }),
  c({
    id: "demo5", name: "Namuna: Sport to‘garagi", address: "Rishton, stadion yonida", lat: 40.364, lng: 71.281,
    phone: "+998900000005", vip: false, rating: 4.7, reviewsCount: 22, daysOld: 5, ageFrom: 6, ageTo: 16,
    amenities: ["Kiyinish xonasi", "Dush"],
    description: "Futbol va umumiy jismoniy tayyorgarlik. Murabbiy — sobiq professional futbolchi.",
    groups: [{ subject: "Sport", days: ["Se", "Pa", "Sh"], time: "17:00–18:30", price: 150000, freeSeats: 8 }]
  }),
  c({
    id: "demo6", name: "Namuna: Matematika maktabi", address: "Rishton, Yoshlik mahallasi", lat: 40.357, lng: 71.276,
    phone: "+998900000006", vip: true, rating: 4.9, reviewsCount: 41, daysOld: 1, ageFrom: 9, ageTo: 17,
    amenities: ["Kichik guruh (6 kishi)", "Konditsioner"],
    description: "Olimpiada matematikasi va fizika. Kichik guruhlar — har bir o‘quvchiga e’tibor.",
    groups: [
      { subject: "Matematika", days: ["Du", "Ch", "Ju"], time: "18:00–19:30", price: 350000, freeSeats: 2 },
      { subject: "Fizika", days: ["Se", "Pa"], time: "18:00–19:30", price: 300000, freeSeats: 1 }
    ]
  }),
  c({
    id: "demo7", name: "Namuna: Smart Kids", address: "Rishton, Bahor ko‘chasi 21", lat: 40.3549, lng: 71.2918,
    phone: "+998900000007", vip: false, rating: 4.7, reviewsCount: 15, daysOld: 2, ageFrom: 4, ageTo: 7,
    amenities: ["O‘yin xonasi", "Kuzatuv kamerasi", "Konditsioner"],
    description: "Maktabgacha yoshdagi bolalar uchun o‘yin orqali ingliz tili va mantiq. Guruhda 8 boladan ko‘p emas.",
    groups: [
      { subject: "Ingliz tili", days: ["Du", "Ch", "Ju"], time: "10:00–11:00", price: 200000, freeSeats: 4 },
      { subject: "Matematika", days: ["Se", "Pa"], time: "10:00–11:00", price: 180000, freeSeats: 2 }
    ]
  }),
  c({
    id: "demo8", name: "Namuna: Shaxmat klubi", address: "Rishton, madaniyat uyi", lat: 40.3627, lng: 71.2868,
    phone: "+998900000008", vip: false, rating: 4.6, reviewsCount: 7, daysOld: 9, ageFrom: 6, ageTo: 16,
    amenities: ["Turnirlar", "Bepul birinchi oy"],
    description: "Boshlang‘ich va o‘rta daraja. Har oy klub ichida turnir, g‘oliblarga sovg‘alar.",
    groups: [{ subject: "Shaxmat", days: ["Se", "Pa", "Sh"], time: "16:00–17:30", price: 120000, freeSeats: 6 }]
  }),
  c({
    id: "demo9", name: "Namuna: Suzish havzasi", address: "Rishton, sport majmuasi", lat: 40.3504, lng: 71.2826,
    phone: "+998900000009", vip: true, rating: 4.8, reviewsCount: 29, daysOld: 1, ageFrom: 5, ageTo: 15,
    amenities: ["Yopiq havza", "Dush", "Kiyinish xonasi", "Tibbiyot xonasi"],
    description: "Yopiq isitiladigan havza, sertifikatli murabbiylar. Bolalar uchun alohida sayoz qism.",
    groups: [
      { subject: "Sport", days: ["Du", "Ch", "Ju"], time: "15:00–16:00", price: 280000, freeSeats: 3 },
      { subject: "Sport", days: ["Sh", "Ya"], time: "10:00–11:00", price: 250000, freeSeats: 0 }
    ]
  }),
  c({
    id: "demo10", name: "Namuna: Savodxonlik maktabi", address: "Rishton, Guliston mahallasi", lat: 40.3586, lng: 71.2789,
    phone: "+998900000010", vip: false, rating: null, reviewsCount: 0, daysOld: 30, ageFrom: 6, ageTo: 10,
    amenities: ["Kichik guruh"],
    description: "1–4-sinf o‘quvchilari uchun o‘qish, yozish va husnixat.",
    groups: [
      { subject: "Ona tili", days: ["Du", "Ch"], time: "14:00–15:00", price: 150000, freeSeats: 5 },
      { subject: "Rus tili", days: ["Se", "Pa"], time: "14:00–15:00", price: 160000, freeSeats: 1 }
    ]
  }),
  c({
    id: "tutor1", kind: "tutor", name: "Namuna: Dilnoza Karimova", address: "Rishton, Markaziy mahalla", lat: 40.3555, lng: 71.2875,
    phone: "+998900000011", vip: false, rating: 4.9, reviewsCount: 14, daysOld: 2, ageFrom: 7, ageTo: 15,
    amenities: ["Uyda dars", "Onlayn"], description: "Ingliz tili o‘qituvchisi, IELTS 7.5. Boshlang‘ich va o‘rta daraja.",
    groups: [{ subject: "Ingliz tili", days: ["Se", "Pa"], time: "17:00–18:00", price: 280000, freeSeats: 2 }]
  }),
  c({
    id: "tutor2", kind: "tutor", name: "Namuna: Jasur Ahmedov", address: "Rishton, Navbahor ko‘chasi", lat: 40.3601, lng: 71.2822,
    phone: "+998900000012", vip: false, rating: 4.7, reviewsCount: 8, daysOld: 4, ageFrom: 12, ageTo: 18,
    amenities: ["Onlayn"], description: "Matematika va fizika, DTM testlariga tayyorlov.",
    groups: [{ subject: "Matematika", days: ["Du", "Ju"], time: "19:00–20:30", price: 320000, freeSeats: 1 }]
  }),
  c({
    id: "tutor3", kind: "tutor", name: "Namuna: Malika Yusupova", address: "Rishton, Do‘stlik ko‘chasi", lat: 40.3534, lng: 71.2841,
    phone: "+998900000013", vip: false, rating: 4.8, reviewsCount: 11, daysOld: 6, ageFrom: 6, ageTo: 12,
    amenities: ["Uyda dars"], description: "Ona tili va o‘qish savodxonligi, boshlang‘ich sinflar uchun.",
    groups: [{ subject: "Ona tili", days: ["Se", "Pa", "Sh"], time: "10:00–11:00", price: 200000, freeSeats: 3 }]
  }),
  // Admin tez qo‘shgan, egasi hali ulanmagan markaz (kun/vaqt noma’lum)
  c({
    id: "demo12", name: "Namuna: Zukko o‘quv markazi", address: "Xaritada ko‘rsatilgan", lat: 40.3625, lng: 71.2765,
    phone: "+998900000014", vip: false, rating: null, daysOld: 12, claimed: false, amenities: [],
    groups: [
      { subject: "Ingliz tili", days: [], time: "", price: 220000, freeSeats: 0 },
      { subject: "Matematika", days: [], time: "", price: 220000, freeSeats: 0 }
    ]
  })
];


/* O‘qituvchilar (namuna) */
const t = (name: string, subject: string, experience: number, about: string) => ({ name, subject, experience, about });
const TEACHERS: Record<string, Center["teachers"]> = {
  demo1: [
    t("Namuna: Nilufar Rahimova", "Ingliz tili", 8, "IELTS 8.0, CELTA sertifikati"),
    t("Namuna: Bekzod Tursunov", "Matematika", 6, "Olimpiada g‘oliblarini tayyorlagan")
  ],
  demo2: [
    t("Namuna: Sherzod Aliyev", "IT", 5, "Python dasturchi, 3 yil kompaniyada ishlagan"),
    t("Namuna: Madina Qodirova", "IT", 3, "Veb-dizayn va Scratch")
  ],
  demo3: [t("Namuna: Zulfiya Ergasheva", "Kimyo", 12, "Oliy toifali o‘qituvchi"), t("Namuna: Rustam Xolmatov", "Biologiya", 9, "Tibbiyot institutiga tayyorlov")],
  demo4: [t("Namuna: Svetlana Ivanova", "Rus tili", 15, "Rus tili va adabiyoti o‘qituvchisi")],
  demo5: [t("Namuna: Anvar Mirzayev", "Sport", 10, "Sobiq professional futbolchi")],
  demo6: [t("Namuna: Akmal Yusupov", "Matematika", 14, "Respublika olimpiadasi hakami"), t("Namuna: Dilshod Karimov", "Fizika", 7, "DTM testlari bo‘yicha mutaxassis")],
  demo7: [t("Namuna: Gulnora Saidova", "Ingliz tili", 6, "Bolalar bilan ishlash bo‘yicha sertifikat"), t("Namuna: Feruza Nazarova", "Matematika", 4, "Montessori metodikasi")],
  demo8: [t("Namuna: Olim Hakimov", "Shaxmat", 20, "FIDE reytingi 2150, xalqaro usta nomzodi")],
  demo9: [t("Namuna: Javohir Ismoilov", "Sport", 8, "Suzish bo‘yicha sport ustasi"), t("Namuna: Kamola Ahmedova", "Sport", 5, "Bolalar suzish murabbiyi")],
  demo10: [t("Namuna: Mohira Abdullayeva", "Ona tili", 11, "Boshlang‘ich sinf o‘qituvchisi")]
};

/* O‘qituvchilar jamoasi bilan ikki qo‘shimcha namuna markaz */
const EXTRA_CENTERS: Center[] = [
  c({
    id: "demo11", name: "Namuna: Ziyo Academy", address: "Rishton, Mustaqillik ko‘chasi 40", lat: 40.3602, lng: 71.2897,
    phone: "+998900000014", vip: true, rating: 4.9, reviewsCount: 52, daysOld: 0, ageFrom: 8, ageTo: 18,
    amenities: ["Wi-Fi", "Konditsioner", "Kutubxona", "Ota-onalar uchun kutish zali"],
    description: "Ingliz tili, matematika va IT bir joyda. Har oy bepul sinov testi va ota-onalar bilan uchrashuv.",
    groups: [
      { subject: "Ingliz tili", days: ["Du", "Ch", "Ju"], time: "14:00–15:30", price: 320000, freeSeats: 4 },
      { subject: "Ingliz tili", days: ["Se", "Pa", "Sh"], time: "16:00–17:30", price: 320000, freeSeats: 0 },
      { subject: "Matematika", days: ["Du", "Ch"], time: "16:00–17:30", price: 280000, freeSeats: 2 },
      { subject: "IT", days: ["Sh", "Ya"], time: "10:00–12:00", price: 380000, freeSeats: 5 }
    ],
    teachers: [
      t("Namuna: Laylo Umarova", "Ingliz tili", 9, "IELTS 8.5, 120+ o‘quvchi 7.0 dan yuqori olgan"),
      t("Namuna: Timur Rashidov", "Ingliz tili", 4, "Speaking klubi rahbari"),
      t("Namuna: Botir Qosimov", "Matematika", 11, "Prezident maktabiga tayyorlov"),
      t("Namuna: Aziza Mamatova", "IT", 5, "Frontend dasturchi, Google sertifikati")
    ]
  }),
  c({
    id: "demo12", name: "Namuna: Til markazi «Polyglot»", address: "Rishton, Yangiobod ko‘chasi 7", lat: 40.3528, lng: 71.2953,
    phone: "+998900000015", vip: false, rating: 4.6, reviewsCount: 19, daysOld: 4, ageFrom: 10, ageTo: 18,
    amenities: ["Wi-Fi", "Interaktiv doska"],
    description: "Ingliz, rus va koreys tillari. Kichik guruhlar, bepul speaking klub.",
    groups: [
      { subject: "Ingliz tili", days: ["Se", "Pa", "Sh"], time: "15:00–16:30", price: 260000, freeSeats: 3 },
      { subject: "Rus tili", days: ["Du", "Ch"], time: "17:00–18:00", price: 200000, freeSeats: 6 },
      { subject: "Koreys tili", days: ["Ju", "Sh"], time: "11:00–12:30", price: 300000, freeSeats: 2 }
    ],
    teachers: [
      t("Namuna: Shahnoza Yo‘ldosheva", "Ingliz tili", 7, "Cambridge CELTA"),
      t("Namuna: Elena Petrova", "Rus tili", 18, "Ona tili — rus tili"),
      t("Namuna: Kim Soo-jin", "Koreys tili", 3, "TOPIK 6, Seuldan")
    ]
  })
];

export const DEMO_CENTERS: Center[] = [...BASE_CENTERS.map((x) => ({ ...x, teachers: TEACHERS[x.id] ?? x.teachers })), ...EXTRA_CENTERS];

export const DEMO_REVIEWS: Review[] = [
  { id: "r1", author: "Nodira", rating: 5, text: "O‘g‘lim 3 oyda ancha o‘sdi, ustozlar juda e’tiborli.", createdMs: now - 4 * DAY },
  { id: "r2", author: "Sardor", rating: 4, text: "Guruh kichik, lekin xona biroz tor. Umuman yaxshi.", createdMs: now - 12 * DAY },
  { id: "r3", author: "Gulbahor", rating: 5, text: "Har oy hisobot berishadi — bu juda qulay.", createdMs: now - 30 * DAY }
];

export const DEMO_CHATS: Chat[] = [
  { id: "demo_demo1", type: "center", centerId: "demo1", title: "Namuna: Bilimdon markazi", lastMessage: "Ha, shanba kuni ham guruh ochamiz.", lastMs: now - 40 * 60000, unread: 1 },
  { id: "demo_demo5", type: "center", centerId: "demo5", title: "Namuna: Sport to‘garagi", lastMessage: "Forma shart emas, sport kiyimi yetarli.", lastMs: now - 1.3 * DAY, unread: 0 }
];

export const DEMO_MESSAGES: Record<string, Message[]> = {
  demo_demo1: [
    { id: "m1", from: "user", text: "Assalomu alaykum! Ingliz tili guruhida shanba kunlari ham dars bormi?", createdMs: now - 60 * 60000 },
    { id: "m2", from: "center", text: "Va alaykum assalom! Hozircha Du, Ch, Ju kunlari.", createdMs: now - 50 * 60000 },
    { id: "m3", from: "center", text: "Ha, shanba kuni ham guruh ochamiz.", createdMs: now - 40 * 60000 }
  ],
  demo_demo5: [
    { id: "m4", from: "user", text: "Mashg‘ulotga maxsus forma kerakmi?", createdMs: now - 1.4 * DAY },
    { id: "m5", from: "center", text: "Forma shart emas, sport kiyimi yetarli.", createdMs: now - 1.3 * DAY }
  ]
};

export const DEMO_CENTER_REPLIES = [
  "Rahmat! Savolingizni oldik, tez orada javob beramiz.",
  "Albatta, sinov darsiga kelishingiz mumkin. Qaysi kun qulay?",
  "Bo‘sh joylar haqida aniq ma’lumotni bugun kechqurun yozamiz."
];
