import type { Day } from "./types";

export const fmtSum = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so‘m";
export const fmtThousand = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} ming` : String(n));

export function daysAgo(ms: number): number | null {
  if (!ms) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}

export function updatedText(ms: number): string {
  const d = daysAgo(ms);
  if (d === null) return "";
  if (d === 0) return "Yangilangan: bugun";
  if (d === 1) return "Yangilangan: kecha";
  return `Yangilangan: ${d} kun oldin`;
}

export const STALE_DAYS = 14;
export const isStale = (ms: number) => {
  const d = daysAgo(ms);
  return d !== null && d > STALE_DAYS;
};

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

export function fmtTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()}-${MONTHS[d.getMonth()]}`;
}

export function fmtDayLabel(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(d) - start(today)) / 86400000);
  if (diff === 0) return "Bugun";
  if (diff === -1) return "Kecha";
  if (diff === 1) return "Ertaga";
  return `${fmtDate(ms)}, ${WEEKDAYS[d.getDay()]}`;
}

/** Chat ro‘yxatidagi vaqt: bugun — soat, hafta ichida — kun, aks holda sana. */
export function fmtListTime(ms: number): string {
  if (!ms) return "";
  const diffDays = (Date.now() - ms) / 86400000;
  if (new Date(ms).toDateString() === new Date().toDateString()) return fmtTime(ms);
  if (diffDays < 2) return "Kecha";
  if (diffDays < 7) return WEEKDAYS[new Date(ms).getDay()];
  return fmtDate(ms);
}

const JS_DAY: Record<Day, number> = { Ya: 0, Du: 1, Se: 2, Ch: 3, Pa: 4, Ju: 5, Sh: 6 };

/** Guruhning keyingi dars vaqti (sinov darsi sanasi uchun). */
export function nextLessonMs(days: Day[], time: string, from = Date.now()): number | null {
  const m = time.match(/(\d{1,2}):(\d{2})/);
  if (!days.length || !m) return null;
  const base = new Date(from);
  for (let i = 1; i <= 8; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i, Number(m[1]), Number(m[2]));
    if (days.some((x) => JS_DAY[x] === d.getDay())) return d.getTime();
  }
  return null;
}

export function plural(n: number, word: string) {
  return `${n} ta ${word}`;
}

export function initials(name: string): string {
  const clean = name.replace(/^Namuna:\s*/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

/** +998 maska: "+998 90 123 45 67" */
export function maskPhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("998")) d = d.slice(3);
  d = d.slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return "+998" + (parts.length ? " " + parts.join(" ") : " ");
}

export function normalizePhone(masked: string): string | null {
  let d = masked.replace(/\D/g, "");
  if (d.length === 9) d = "998" + d;
  return /^998\d{9}$/.test(d) ? "+" + d : null;
}
