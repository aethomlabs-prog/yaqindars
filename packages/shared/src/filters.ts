/* Xarita filtrlari — sof funksiyalar (holat boshqaruvi har platformada o'zi). */
import { distanceKm } from "./geo";
import { SUBJECTS } from "./subjects";
import type { Center, Day, LatLng } from "./types";

export const PRICE_MIN = 100000;
export const PRICE_MAX = 600000;
export const AGE_GROUPS = [
  { id: "3-6", label: "3–6 yosh", from: 3, to: 6 },
  { id: "7-10", label: "7–10 yosh", from: 7, to: 10 },
  { id: "11-14", label: "11–14 yosh", from: 11, to: 14 },
  { id: "15-18", label: "15+ yosh", from: 15, to: 18 }
] as const;
export const RADII = [
  { km: 0.5, label: "500 m" },
  { km: 1, label: "1 km" },
  { km: 3, label: "3 km" }
];

export interface Filters {
  subject: string | null;
  priceMin: number;
  priceMax: number;
  days: Day[];
  freeOnly: boolean;
  age: string | null;
  radius: number | null;
}

export const EMPTY_FILTERS: Filters = { subject: null, priceMin: PRICE_MIN, priceMax: PRICE_MAX, days: [], freeOnly: false, age: null, radius: null };

/** Filtr oynasidagi faol filtrlar soni (fan va radius alohida ko'rinadi). */
export function activeFilterCount(f: Filters) {
  return (f.priceMin > PRICE_MIN || f.priceMax < PRICE_MAX ? 1 : 0) + (f.days.length ? 1 : 0) + (f.freeOnly ? 1 : 0) + (f.age ? 1 : 0);
}

export interface Visible {
  center: Center;
  groups: number[];
  km: number;
  free: number;
  minPrice: number;
}

export function filterCenters(centers: Center[], f: Filters, pos: LatLng): Visible[] {
  const age = AGE_GROUPS.find((a) => a.id === f.age);
  const out: Visible[] = [];
  for (const c of centers) {
    const km = distanceKm(pos, c);
    if (f.radius && km > f.radius) continue;
    if (age && c.ageFrom != null && c.ageTo != null && (c.ageTo < age.from || c.ageFrom > age.to)) continue;
    const groups: number[] = [];
    c.groups.forEach((g, i) => {
      if (f.subject && f.subject !== "Boshqa" && g.subject !== f.subject) return;
      if (f.subject === "Boshqa" && SUBJECTS.includes(g.subject) && g.subject !== "Boshqa") return;
      // Slayder chetlari «cheksiz» degani: 100 ming dan arzon va 600 ming dan qimmat guruhlar ham chiqadi
      if ((f.priceMin > PRICE_MIN && g.price < f.priceMin) || (f.priceMax < PRICE_MAX && g.price > f.priceMax)) return;
      if (f.days.length && !g.days.every((d) => f.days.includes(d))) return;
      if (f.freeOnly && g.freeSeats <= 0) return;
      groups.push(i);
    });
    if (!groups.length) continue;
    out.push({
      center: c,
      groups,
      km,
      free: groups.reduce((s, i) => s + c.groups[i].freeSeats, 0),
      minPrice: Math.min(...groups.map((i) => c.groups[i].price))
    });
  }
  return out.sort((a, b) => Number(b.center.vip) - Number(a.center.vip) || a.km - b.km);
}
