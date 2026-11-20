/* O‘rtacha (mediana) narx: fan bo‘yicha, narxi ma’lum guruhlar; kamida 3 ta guruh bo‘lsa ko‘rsatiladi. */
import type { Center } from "./types";

export const MEDIAN_MIN = 3;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** fan -> { median (10 mingga yaxlitlangan), n } */
export function subjectMedians(centers: Center[]): Map<string, { median: number; n: number }> {
  const by = new Map<string, number[]>();
  for (const c of centers) for (const g of c.groups) if (g.price > 0) by.set(g.subject, [...(by.get(g.subject) ?? []), g.price]);
  const out = new Map<string, { median: number; n: number }>();
  by.forEach((prices, subject) => {
    if (prices.length >= MEDIAN_MIN) out.set(subject, { median: Math.round(median(prices) / 10000) * 10000, n: prices.length });
  });
  return out;
}

/** ±10% dan ko‘p farq qilsa — «arzonroq» / «qimmatroq» */
export function priceLevel(price: number, med: number): "cheap" | "pricey" | "avg" {
  if (price <= 0 || med <= 0) return "avg";
  if (price < med * 0.9) return "cheap";
  if (price > med * 1.1) return "pricey";
  return "avg";
}
