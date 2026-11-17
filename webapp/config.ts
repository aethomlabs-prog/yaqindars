/**
 * YaqinDars Mini App sozlamalari.
 *
 * FIREBASE_CONFIG = null bo‘lsa — ilova DEMO rejimda ishlaydi (namuna ma’lumotlar, localStorage).
 * Firebase konsoli: Project settings → General → Your apps → Web app → "firebaseConfig".
 * Bu kalitlar ochiq bo‘lishi normal — bazani firestore.rules himoya qiladi.
 */
export const FIREBASE_CONFIG: Record<string, string> | null = {
  apiKey: "AIzaSyD2sGc0bJ3HnaJ93-AQvpI2IRgIWps0hpU",
  authDomain: "yaqindars.firebaseapp.com",
  projectId: "yaqindars",
  storageBucket: "yaqindars.firebasestorage.app",
  messagingSenderId: "1083900858251",
  appId: "1:1083900858251:web:a48b8506c42d8ed7ec298e"
};

/**
 * Cloud Functions manzili (functions/ deploy qilingandan keyin).
 * Bo‘sh bo‘lsa: Telegram orqali kirish va AI chat o‘chiq — profil qurilmada saqlanadi,
 * AI esa oddiy qoidaga asoslangan qidiruv bilan ishlaydi.
 * Misol: "https://us-central1-yaqindars.cloudfunctions.net"
 */
export const FUNCTIONS_URL: string = "";

/** Bot username (@ siz) — /markaz havolasi va «Ulashish» uchun. */
export const BOT_USERNAME: string = "";

/** To‘lov va murojaatlar — admin kontaktlari (kabinetdagi «Hisobim», «Ilova haqida») */
export const ADMIN_TELEGRAM = "NOZIMJONS";
export const ADMIN_PHONE = "+998 90 389 21 26";
/** Tarif narxlari (so‘m/oy) va bepul sinov muddati (kun) — bot/parsers.py tariff_price bilan bir xil.
 * Oddiy tarif: o‘quv markazi 75 000, repetitor 45 000. VIP — 150 000. */
export const PRICES = { center: 75000, tutor: 45000, vip: 150000 } as const;
export const TRIAL_DAYS = 15;
export function tariffPrice(kind: "center" | "tutor", tariff: "oddiy" | "vip" | null | undefined): number {
  return tariff === "vip" ? PRICES.vip : kind === "tutor" ? PRICES.tutor : PRICES.center;
}

/** Rus tili tarjimasi tayyor bo‘lguncha til tanlash yashirin, interfeys doim o‘zbekcha. */
export const LANG_SWITCH_ENABLED = false;

/** DEMO rejimni majburan yoqish: URL oxiriga ?demo=1 qo‘shing. */
export const FORCE_DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");
