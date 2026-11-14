/* Telegram WebApp SDK o‘rami. Oddiy brauzerda (platform = "unknown") hamma chaqiruvlar xavfsiz «no-op». */
import { useEffect, useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TG = any;
const raw: TG = (window as any).Telegram?.WebApp;
// Muhim: pastdagi KLAVIATURA tugmasidan ochilgan Mini App’da initData BO‘SH bo‘ladi (sendData shu rejimda ishlaydi),
// shuning uchun Telegram ichida ekanimizni platform orqali aniqlaymiz.
export const tg: TG | null = raw && (raw.initData || (raw.platform && raw.platform !== "unknown")) ? raw : null;
export const inTelegram = !!tg;
export const can = (ver: string) => !!tg && !!tg.isVersionAtLeast?.(ver);

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}
export const tgUser: TgUser | null = tg?.initDataUnsafe?.user ?? null;
export const startParam: string | null = tg?.initDataUnsafe?.start_param ?? null;
export const initData: string = tg?.initData ?? "";

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (can("7.7")) tg.disableVerticalSwipes();
}

export function applyChromeColors(bg: string, bar: string) {
  if (!can("6.1")) return;
  try {
    tg.setHeaderColor(bg);
    tg.setBackgroundColor(bg);
    if (can("7.10")) tg.setBottomBarColor(bar);
  } catch {
    /* eski mijoz */
  }
}

export const telegramColorScheme = (): "light" | "dark" | null => (tg ? tg.colorScheme : null);
export function onThemeChanged(fn: () => void) {
  tg?.onEvent?.("themeChanged", fn);
  return () => tg?.offEvent?.("themeChanged", fn);
}

/** Telegram oyna o‘lchami o‘zgarganda (expand, klaviatura, aylantirish) */
export function onViewportChanged(fn: () => void) {
  tg?.onEvent?.("viewportChanged", fn);
  return () => tg?.offEvent?.("viewportChanged", fn);
}

/* ---------- Joylashuv: Telegram LocationManager (Bot API 8.0+) ---------- */
export interface Fix {
  lat: number;
  lng: number;
  /** aniqlik, metr */
  acc: number | null;
}

/** Telegram’ning o‘z joylashuv API’si. Mavjud bo‘lmasa yoki rad etilsa — null. */
export function tgLocation(): Promise<Fix | null> {
  const lm = can("8.0") ? tg.LocationManager : null;
  if (!lm) return Promise.resolve(null);
  return new Promise((resolve) => {
    const get = () => {
      if (!lm.isLocationAvailable) return resolve(null);
      lm.getLocation((d: { latitude: number; longitude: number; horizontal_accuracy?: number } | null) =>
        resolve(d ? { lat: d.latitude, lng: d.longitude, acc: d.horizontal_accuracy ?? null } : null)
      );
    };
    try {
      if (lm.isInited) get();
      else lm.init(get);
    } catch {
      resolve(null);
    }
  });
}

/** Joylashuvga ruxsat rad etilgan bo‘lsa — Telegram sozlamalarini ochish */
export function openLocationSettings(): boolean {
  const lm = can("8.0") ? tg.LocationManager : null;
  if (lm?.isInited && lm.isAccessRequested && !lm.isAccessGranted) {
    lm.openSettings();
    return true;
  }
  return false;
}

/* ---------- Bosh ekranga qo‘shish (Bot API 8.0+) ---------- */
export type HomeStatus = "unsupported" | "unknown" | "added" | "missed";

export function checkHomeScreen(): Promise<HomeStatus> {
  if (!can("8.0") || !tg.checkHomeScreenStatus) return Promise.resolve("unsupported");
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve("unknown"), 2000);
    try {
      tg.checkHomeScreenStatus((s: HomeStatus) => {
        clearTimeout(t);
        resolve(s || "unknown");
      });
    } catch {
      clearTimeout(t);
      resolve("unsupported");
    }
  });
}

/** Telegram’ning «Bosh ekranga qo‘shish» oynasi; qo‘shilganda onAdded chaqiriladi */
export function addToHomeScreen(onAdded: () => void): boolean {
  if (!can("8.0") || !tg.addToHomeScreen) return false;
  const h = () => {
    tg.offEvent?.("homeScreenAdded", h);
    onAdded();
  };
  tg.onEvent?.("homeScreenAdded", h);
  tg.addToHomeScreen();
  return true;
}

/* ---------- Haptic ---------- */
export const haptic = {
  selection: () => can("6.1") && tg.HapticFeedback.selectionChanged(),
  light: () => can("6.1") && tg.HapticFeedback.impactOccurred("light"),
  success: () => can("6.1") && tg.HapticFeedback.notificationOccurred("success"),
  error: () => can("6.1") && tg.HapticFeedback.notificationOccurred("error")
};

/* ---------- Havolalar ---------- */
export function openLink(url: string) {
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener");
}
export function openTelegramLink(url: string) {
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank", "noopener");
}

/* ---------- Orqaga: global LIFO stek (sheet va ichki sahifalar) ---------- */
type Handler = { id: number; fn: () => void };
const stack: Handler[] = [];
let seq = 0;

function syncBackButton() {
  if (!can("6.1")) return;
  if (stack.length) tg.BackButton.show();
  else tg.BackButton.hide();
}
function runTop() {
  stack[stack.length - 1]?.fn();
}
if (can("6.1")) tg.BackButton.onClick(runTop);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") runTop();
});

/** active=true bo‘lsa, Telegram «Orqaga» (va Esc) shu handlerni chaqiradi. */
export function useBackHandler(active: boolean, fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const h: Handler = { id: ++seq, fn: () => ref.current() };
    stack.push(h);
    syncBackButton();
    return () => {
      const i = stack.findIndex((x) => x.id === h.id);
      if (i >= 0) stack.splice(i, 1);
      syncBackButton();
    };
  }, [active]);
}

/* ---------- MainButton (ariza formasida) ---------- */
export function useMainButton(opts: { visible: boolean; text: string; enabled?: boolean; loading?: boolean; onClick: () => void }) {
  const ref = useRef(opts.onClick);
  ref.current = opts.onClick;
  const { visible, text, enabled = true, loading = false } = opts;
  useEffect(() => {
    if (!tg?.MainButton) return;
    const mb = tg.MainButton;
    const handler = () => ref.current();
    if (!visible) {
      mb.hide();
      return;
    }
    mb.setParams({ text, is_active: enabled, is_visible: true, color: "#22B573", text_color: "#FFFFFF" });
    if (loading) mb.showProgress?.(false);
    else mb.hideProgress?.();
    mb.onClick(handler);
    return () => {
      mb.offClick(handler);
      mb.hideProgress?.();
      mb.hide();
    };
  }, [visible, text, enabled, loading]);
}
