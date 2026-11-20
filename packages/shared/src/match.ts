/* Qoidaga asoslangan qidiruv: qidiruv sahifasi va AI chat zaxira rejimi uchun. */
import { distanceKm } from "./geo";
import { fmtSum } from "./format";
import type { Center, Day, LatLng } from "./types";


const SUBJECT_WORDS: Record<string, string[]> = {
  "Ingliz tili": ["ingliz", "english", "inglis"],
  IELTS: ["ielts", "aylts", "ayelts"],
  CEFR: ["cefr", "sefr", "multilevel", "milliy sertifikat"],
  SAT: ["sat "],
  Tarix: ["tarix"],
  Geografiya: ["geograf"],
  Huquq: ["huquq"],
  Iqtisodiyot: ["iqtisod", "ekonom", "buxgalter"],
  "Nemis tili": ["nemis", "german"],
  "Koreys tili": ["koreys", "korean", "topik"],
  "Turk tili": ["turk"],
  "Arab tili": ["arab"],
  "Xitoy tili": ["xitoy", "chinese", "hsk"],
  "Fransuz tili": ["fransuz", "french"],
  "DTM / Abituriyent": ["dtm", "abituriyent", "test markaz", "oliygoh"],
  Robototexnika: ["robot"],
  "Mental arifmetika": ["mental", "arifmetika"],
  "Maktabga tayyorlov": ["maktabga tayyor", "bog‘cha", "bogcha"],
  "Boshlang‘ich sinf": ["boshlang"],
  Rasm: ["rasm", "chizish", "art"],
  Musiqa: ["musiqa", "pianino", "gitara", "vokal"],
  Matematika: ["matem", "algebra", "geometr"],
  IT: ["it ", "it,", "dastur", "kompyuter", "python", "programm", "informat"],
  "Rus tili": ["rus"],
  Kimyo: ["kimyo", "ximiya"],
  Biologiya: ["biolog"],
  Fizika: ["fizik"],
  "Ona tili": ["ona tili", "savod", "o‘qish", "adabiyot"],
  Sport: ["sport", "futbol", "kurash", "suzish", "boks"],
  Shaxmat: ["shaxmat", "shahmat", "chess"]
};

const DAY_WORDS: [Day, string[]][] = [
  ["Du", ["dushanba"]],
  ["Se", ["seshanba"]],
  ["Ch", ["chorshanba"]],
  ["Pa", ["payshanba"]],
  ["Ju", ["juma"]],
  ["Sh", ["shanba"]],
  ["Ya", ["yakshanba"]]
];

export interface Parsed {
  subject: string | null;
  maxPrice: number | null;
  days: Day[];
  nearest: boolean;
  freeOnly: boolean;
  text: string;
}

export function parseQuery(q: string): Parsed {
  const t = ` ${q.toLowerCase().replace(/[’'`ʻ]/g, "‘")} `;
  let subject: string | null = null;
  for (const [s, words] of Object.entries(SUBJECT_WORDS)) {
    if (words.some((w) => t.includes(w))) {
      subject = s;
      break;
    }
  }
  let maxPrice: number | null = null;
  const ming = t.match(/(\d[\d\s]*)\s*(ming|k\b)/);
  const plain = t.match(/(\d{5,7})/);
  if (ming) maxPrice = parseInt(ming[1].replace(/\s/g, ""), 10) * 1000;
  else if (plain) maxPrice = parseInt(plain[1], 10);
  // "shanba" "yakshanba"/"dushanba" ichida ham bor — avval uzunlarini tekshiramiz
  const days: Day[] = [];
  let rest = t;
  for (const [d, words] of [...DAY_WORDS].sort((a, b) => b[1][0].length - a[1][0].length)) {
    for (const w of words) {
      if (rest.includes(w)) {
        days.push(d);
        rest = rest.split(w).join(" ");
      }
    }
  }
  return {
    subject,
    maxPrice,
    days,
    nearest: /yaqin|uyga|yonida/.test(t),
    freeOnly: /bo‘sh joy|joy bor/.test(t),
    text: q.trim()
  };
}

export interface Match {
  center: Center;
  groupIndexes: number[];
  km: number;
}

export function findMatches(centers: Center[], p: Parsed, pos: LatLng, limit = 3): Match[] {
  const name = p.subject ? "" : p.text.toLowerCase().replace(/^namuna:\s*/, "");
  const list: Match[] = [];
  for (const c of centers) {
    const idx: number[] = [];
    c.groups.forEach((g, i) => {
      if (p.subject && g.subject !== p.subject) return;
      if (p.maxPrice && g.price > p.maxPrice) return;
      if (p.days.length && !g.days.some((d) => p.days.includes(d))) return;
      if (p.freeOnly && g.freeSeats <= 0) return;
      idx.push(i);
    });
    const nameHit = name.length >= 3 && c.name.toLowerCase().includes(name);
    if (idx.length || nameHit) list.push({ center: c, groupIndexes: idx.length ? idx : c.groups.map((_, i) => i), km: distanceKm(pos, c) });
  }
  list.sort((a, b) => {
    if (!p.nearest && a.center.vip !== b.center.vip) return a.center.vip ? -1 : 1;
    const freeA = a.groupIndexes.some((i) => a.center.groups[i].freeSeats > 0) ? 0 : 1;
    const freeB = b.groupIndexes.some((i) => b.center.groups[i].freeSeats > 0) ? 0 : 1;
    return freeA - freeB || a.km - b.km;
  });
  return list.slice(0, limit);
}

/** AI zaxira rejimi: oddiy matnli javob + kartochkalar. */
export function ruleBasedReply(centers: Center[], q: string, pos: LatLng): { text: string; cards: string[] } {
  const p = parseQuery(q);
  if (!p.subject && !p.maxPrice && !p.days.length && !p.nearest) {
    return {
      text: "Qaysi fan kerakligini yozing — masalan: «Ingliz tili, 300 minggacha» yoki «Shanba kuni matematika». Narx, kun va masofani ham hisobga olaman.",
      cards: []
    };
  }
  const m = findMatches(centers, p, pos);
  if (!m.length) {
    return { text: "Afsuski, bu shartlarga mos guruh topilmadi. Narx yoki kunlarni o‘zgartirib ko‘ring.", cards: [] };
  }
  const parts = [p.subject, p.maxPrice ? `${fmtSum(p.maxPrice)}gacha` : null, p.days.length ? p.days.join(", ") : null, p.nearest ? "uyga yaqin" : null]
    .filter(Boolean)
    .join(", ");
  return {
    text: `${parts ? `«${parts}» bo‘yicha ` : ""}${m.length} ta mos variant topdim. Bo‘sh joyi borlari birinchi:`,
    cards: m.map((x) => x.center.id)
  };
}
