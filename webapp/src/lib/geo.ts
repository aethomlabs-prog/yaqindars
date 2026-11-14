import { tgLocation, type Fix } from "./telegram";
import type { LatLng } from "./types";

export type { Fix };

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

const fromBrowser = (p: GeolocationPosition): Fix => ({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? null });

function browserFix(timeout: number): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition((p) => resolve(fromBrowser(p)), reject, { enableHighAccuracy: true, timeout, maximumAge: 15000 });
  });
}

/** Aniq joylashuv: brauzer GPS (yuqori aniqlik), u ishlamasa — Telegram LocationManager. */
export async function getCurrentPosition(timeout = 12000): Promise<Fix> {
  try {
    return await browserFix(timeout);
  } catch (e) {
    const t = await tgLocation();
    if (t) return t;
    throw e;
  }
}

/** Joylashuvni doimiy kuzatish (xarita ochiq paytida). Qaytaradi: to‘xtatish funksiyasi. */
export function watchPosition(onFix: (f: Fix) => void, onDenied?: () => void): () => void {
  if (!navigator.geolocation) return () => {};
  const id = navigator.geolocation.watchPosition(
    (p) => onFix(fromBrowser(p)),
    (e) => {
      if (e.code === e.PERMISSION_DENIED) onDenied?.();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function routeUrl(to: LatLng, from?: LatLng | null): string {
  const f = from ? `${from.lat},${from.lng}` : "";
  return `https://yandex.uz/maps/?rtext=${f}~${to.lat},${to.lng}&rtt=auto`;
}
