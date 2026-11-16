/* Foydalanuvchi qayerdan kelgan: t.me/BOT?startapp=src_<kanal> (flyer, maktab…) yoki c_<markazId> (markaz QR’i).
 * Birinchi manba qurilmada eslab qolinadi — keyingi arizalar ham shu kanalga yoziladi. */
import { startParam } from "./telegram";

const KEY = "yd-src";
export const SOURCE_RE = /^(src_[a-z0-9_]{2,30}|c_[A-Za-z0-9]{1,40})$/;

export function appSource(): string | null {
  if (startParam && SOURCE_RE.test(startParam)) {
    try {
      if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, startParam);
    } catch {
      /* xususiy rejim */
    }
    return startParam;
  }
  try {
    const v = localStorage.getItem(KEY);
    return v && SOURCE_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Toshkent sanasi (YYYY-MM-DD) — kunlik hisoblagich hujjatlari uchun */
export const tashkentDate = (ms = Date.now()) => new Date(ms + 5 * 3600000).toISOString().slice(0, 10);
