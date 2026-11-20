/* Spamdan himoya (Functions'da tekshiriladi): ariza limitlari, Telegram orqali kirish tokeni. Sof funksiyalar — testlash oson. */

export const APP_LIMITS = {
  /** bitta foydalanuvchi (uid) dan kuniga */
  perUidPerDay: 5,
  /** bitta foydalanuvchidan bitta markazga kuniga */
  perCenterPerDay: 2,
  /** bitta telefon raqamidan kuniga (turli qurilmalardan ham) */
  perPhonePerDay: 5
} as const;

export interface AppCounts {
  uidToday: number;
  uidCenterToday: number;
  phoneToday: number;
}

/** Ariza yuborish mumkin bo'lmasa — o'zbekcha sabab, mumkin bo'lsa null */
export function applicationLimitError(c: AppCounts): string | null {
  if (c.uidCenterToday >= APP_LIMITS.perCenterPerDay) return "Bu markazga bugun allaqachon ariza yuborgansiz. Markaz siz bilan bog‘lanadi.";
  if (c.uidToday >= APP_LIMITS.perUidPerDay) return "Bugun juda ko‘p ariza yubordingiz. Ertaga qayta urinib ko‘ring.";
  if (c.phoneToday >= APP_LIMITS.perPhonePerDay) return "Bu telefon raqamidan bugun juda ko‘p ariza yuborilgan. Ertaga qayta urinib ko‘ring.";
  return null;
}

/* ---------------- Telegram orqali kirish (markazlar va admin) ---------------- */
export const TG_LOGIN = {
  tokenLength: 32,
  ttlMs: 10 * 60 * 1000,
  maxFails: 5,
  blockMs: 15 * 60 * 1000
} as const;

const TOKEN_RE = /^[A-Za-z0-9]{32}$/;
export const isLoginToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);

/** /start login_<token> → token yoki null */
export function parseStartLogin(text: string | undefined | null): string | null {
  const m = (text ?? "").trim().match(/^\/start(?:@\w+)?\s+login_([A-Za-z0-9]{32})$/);
  return m ? m[1] : null;
}

export type TgLoginStatus = "pending" | "confirmed" | "used" | "expired";

export interface TgLoginDoc {
  anonUid: string;
  status: TgLoginStatus;
  expiresAt: number;
  tgId?: number;
}

/** Bot tasdiqlay oladimi (token muddati va holati) */
export function canConfirm(doc: TgLoginDoc | null, now: number): string | null {
  if (!doc) return "Kirish havolasi topilmadi. Ilovada «Markaz bo‘lib kirish» ni qayta bosing.";
  if (doc.status !== "pending") return "Bu havola allaqachon ishlatilgan. Ilovada qayta urinib ko‘ring.";
  if (now > doc.expiresAt) return "Havolaning muddati tugagan (10 daqiqa). Ilovada qayta urinib ko‘ring.";
  return null;
}

/** Ilova kirishni yakunlay oladimi: o'sha anonim foydalanuvchi, tasdiqlangan, muddati o'tmagan */
export function canFinish(doc: TgLoginDoc | null, uid: string, now: number): string | null {
  if (!doc) return "Kirish so‘rovi topilmadi.";
  if (doc.anonUid !== uid) return "Bu kirish so‘rovi boshqa qurilmaga tegishli.";
  if (doc.status === "used") return "Bu kirish allaqachon yakunlangan.";
  if (doc.status !== "confirmed" || !doc.tgId) return "Telegram’da hali tasdiqlanmagan.";
  if (now > doc.expiresAt) return "Kirish muddati tugagan. Qaytadan urinib ko‘ring.";
  return null;
}

/** Ketma-ket muvaffaqiyatsiz urinishlar: 5 tadan keyin 15 daqiqa blok */
export function isBlocked(fails: { count: number; lastMs: number } | null, now: number): boolean {
  return !!fails && fails.count >= TG_LOGIN.maxFails && now - fails.lastMs < TG_LOGIN.blockMs;
}

/** Telegram foydalanuvchisining Firebase uid'i */
export const tgUid = (tgId: number) => `tg_${tgId}`;
