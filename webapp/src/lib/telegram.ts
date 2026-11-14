/* Telegram WebApp SDK o‘rami. Oddiy brauzerda (initData bo‘sh) hamma chaqiruvlar xavfsiz «no-op». */
import { useEffect, useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type TG = any;
const raw: TG = (window as any).Telegram?.WebApp;
export const tg: TG | null = raw?.initData ? raw : null;
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
