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

/** Rus tili tarjimasi tayyor bo‘lguncha til tanlash yashirin, interfeys doim o‘zbekcha. */
export const LANG_SWITCH_ENABLED = false;

/** DEMO rejimni majburan yoqish: URL oxiriga ?demo=1 qo‘shing. */
export const FORCE_DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");
