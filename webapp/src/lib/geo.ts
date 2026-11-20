import { inTelegram, tgLocation, type Fix } from "./telegram";

export type { Fix };

export { RISHTON, distanceKm, formatDistance, routeUrl, googleRouteUrl } from "@shared/geo";

const fromBrowser = (p: GeolocationPosition): Fix => ({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? null });

function browserFix(timeout: number): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("unsupported"));
    navigator.geolocation.getCurrentPosition((p) => resolve(fromBrowser(p)), reject, { enableHighAccuracy: true, timeout, maximumAge: 15000 });
  });
}

/** Aniq joylashuv: brauzer GPS (yuqori aniqlik), u ishlamasa — Telegram LocationManager. */
export async function getCurrentPosition(timeout = 12000): Promise<Fix> {
  // Telegram ichida webview GPS’i ko‘pincha bloklangan — avval Telegram’ning o‘z API’si (ruxsat oynasi bilan)
  if (inTelegram) {
    const t = await tgLocation();
    if (t) return t;
  }
  try {
    return await browserFix(timeout);
  } catch (e) {
    const t = inTelegram ? null : await tgLocation();
    if (t) return t;
    throw e;
  }
}

/** Joylashuvni doimiy kuzatish (xarita ochiq paytida). Qaytaradi: to‘xtatish funksiyasi. */
export function watchPosition(onFix: (f: Fix) => void, onDenied?: () => void): () => void {
  let browserOk = false;
  let id: number | null = null;
  if (navigator.geolocation)
    id = navigator.geolocation.watchPosition(
      (p) => {
        browserOk = true;
        onFix(fromBrowser(p));
      },
      (e) => {
        if (e.code === e.PERMISSION_DENIED) onDenied?.();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
  // Telegram ichida webview GPS ishlamasa — Telegram LocationManager’dan har 10 soniyada yangilaymiz
  const poll = inTelegram
    ? setInterval(async () => {
        if (browserOk) return;
        const t = await tgLocation();
        if (t) onFix(t);
      }, 10000)
    : null;
  return () => {
    if (id !== null) navigator.geolocation.clearWatch(id);
    if (poll) clearInterval(poll);
  };
}

