/* Masofa va yo'nalish havolalari (platformaga bog'liq emas). GPS olish — har platformada alohida. */
import type { LatLng } from "./types";

export const RISHTON: LatLng = { lat: 40.3567, lng: 71.2847 };

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(km: number): string {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

/** Yandex Xaritalar — yo'nalish (O'zbekistonda eng aniq) */
export function routeUrl(to: LatLng, from?: LatLng | null): string {
  const f = from ? `${from.lat},${from.lng}` : "";
  return `https://yandex.uz/maps/?rtext=${f}~${to.lat},${to.lng}&rtt=auto`;
}

/** Google Maps — yo'nalish */
export function googleRouteUrl(to: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;
}
