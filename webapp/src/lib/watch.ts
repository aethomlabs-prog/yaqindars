/* Saqlangan qidiruv sarlavhasi (bot bilan bir xil matn) */
import type { Watch } from "./types";

export function watchTitle(w: Pick<Watch, "subject" | "radiusKm" | "maxPrice" | "days">) {
  const parts = [w.subject || "Istalgan fan"];
  if (w.radiusKm) parts.push(`${w.radiusKm < 1 ? `${w.radiusKm * 1000} m` : `${w.radiusKm} km`} gacha`);
  if (w.maxPrice) parts.push(`${Math.round(w.maxPrice / 1000)} ming so‘mgacha`);
  if (w.days.length) parts.push(w.days.join(", "));
  return parts.join(" · ");
}

export const WATCH_LIMIT = 10;
