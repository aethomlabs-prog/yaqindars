/* Tariflar (so'm/oy) va bepul davr — ilova, veb va Functions uchun yagona manba.
 * Oddiy tarif: o'quv markazi 75 000, repetitor 45 000. VIP — 150 000. Bepul davr — 15 kun. */
export const PRICES = { center: 75000, tutor: 45000, vip: 150000 } as const;
export const TRIAL_DAYS = 15;

export type Kind = "center" | "tutor";
export type Tariff = "oddiy" | "vip";

export function tariffPrice(kind: Kind, tariff: Tariff | null | undefined): number {
  return tariff === "vip" ? PRICES.vip : kind === "tutor" ? PRICES.tutor : PRICES.center;
}
