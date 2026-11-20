/* Umumiy o'zbekcha matnlar va aloqa ma'lumotlari */
export const BRAND = {
  blue: "#1E6FD9",
  navy: "#0F3D7A",
  green: "#22B573",
  greenText: "#13804F",
  gold: "#F5B700",
  bg: "#F4F6FA",
  ink: "#14213D"
} as const;

export const CONTACT = {
  adminTelegram: "nozimjons",
  adminPhone: "+998 90 389 21 26",
  channel: "yaqindars_uz",
  bot: "yaqindars_bot",
  site: "https://yaqindars.uz"
} as const;

/** Markaz havolasi (QR, ulashish): ilova o'rnatilgan bo'lsa — ilovada, aks holda saytda ochiladi */
export const centerUrl = (id: string) => `${CONTACT.site}/c/${encodeURIComponent(id)}`;

/** Kampaniya manbalari (?src=) */
export const CAMPAIGNS = ["flyer", "maktab", "stiker", "instagram", "youtube"] as const;
export const SOURCE_RE = /^(src_[a-z0-9_]{2,30}|c_[A-Za-z0-9]{1,40})$/;

/** Toshkent sanasi (YYYY-MM-DD) — kunlik hisoblagichlar uchun */
export const tashkentDate = (ms = Date.now()) => new Date(ms + 5 * 3600000).toISOString().slice(0, 10);
