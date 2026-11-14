/* «Ilovani telefoningizga o‘rnatasizmi?» — o‘rnatilmaguncha har ochilganda 4,5 soniyadan keyin.
 *
 * Ilova TELEGRAM’SIZ ochilishi uchun brauzer orqali haqiqiy ilova (PWA) sifatida o‘rnatiladi:
 *  - Telegram ichida: «Ha» → sayt brauzerda ochiladi (?install=1) → u yerda o‘rnatiladi.
 *    (Telegram’ning addToHomeScreen yorlig‘i har doim Telegram’ni ochadi — shuning uchun ishlatilmaydi.)
 *  - Android/Chrome: tizimning «O‘rnatish» oynasi (beforeinstallprompt).
 *  - iPhone/Safari: «Ulashish → Bosh ekranga qo‘shish» yo‘riqnomasi.
 * O‘rnatilgan ilova (standalone) ichida taklif chiqmaydi. */
import { ExternalLink, Share, Smartphone, SquarePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { haptic, inTelegram, openLink } from "../lib/telegram";
import { useApp } from "../store/app";
import { LogoMark } from "./brand";
import { Button } from "./ios/controls";
import { Sheet } from "./ios/Sheet";

const KEY = "yd-installed";
const ASKED_TG = "yd-install-opened"; // Telegram’dan brauzerga yuborilgan — Telegram ichida qayta so‘ramaymiz
// ?install=1 (botdagi «📲 O‘rnatib olish» havolasi) — taklif darhol chiqadi
const FORCE = typeof location !== "undefined" && new URLSearchParams(location.search).has("install");
const DELAY = FORCE ? 600 : 4500;

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const flag = (k: string) => {
  try {
    return localStorage.getItem(k) === "1";
  } catch {
    return false;
  }
};
const setFlag = (k: string) => {
  try {
    localStorage.setItem(k, "1");
  } catch {
    /* private rejim */
  }
};
export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Brauzerda ochiladigan o‘rnatish manzili (Telegram parametrlarisiz) */
export function installUrl() {
  const u = new URL(location.href.split("#")[0]);
  u.search = "";
  u.searchParams.set("install", "1");
  return u.toString();
}

// beforeinstallprompt sahifa yuklanishi bilan keladi — komponentdan oldin ushlab qolamiz
let deferred: BIPEvent | null = null;
const bipListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    bipListeners.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => setFlag(KEY));
}

/* O‘rnatish sahifasi (InstallLanding) uchun */
export const getInstallPrompt = () => deferred;
export const markInstalled = () => setFlag(KEY);
export function onInstallPromptReady(fn: () => void) {
  bipListeners.add(fn);
  return () => void bipListeners.delete(fn);
}
/** ?install=1 brauzerda — alohida o‘rnatish sahifasi ko‘rsatiladi */
export const INSTALL_LANDING = FORCE && !inTelegram;

type Mode = "telegram" | "pwa" | "ios";

export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("telegram");
  const showToast = useApp((s) => s.showToast);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || isStandalone() || INSTALL_LANDING) return;
    started.current = true;
    const decide = (): Mode | null => {
      if (inTelegram) return flag(ASKED_TG) && !FORCE ? null : "telegram";
      if (flag(KEY) && !FORCE) return null;
      if (deferred) return "pwa";
      if (isIOS()) return "ios";
      return null;
    };
    let on: (() => void) | null = null;
    const t = setTimeout(() => {
      const m = decide();
      if (m) {
        setMode(m);
        setOpen(true);
      } else if (!inTelegram) {
        // Chrome beforeinstallprompt’ni biroz kechroq yuborishi mumkin
        on = () => {
          if (deferred && (!flag(KEY) || FORCE)) {
            setMode("pwa");
            setOpen(true);
          }
        };
        bipListeners.add(on);
      }
    }, DELAY);
    return () => {
      clearTimeout(t);
      if (on) bipListeners.delete(on);
    };
  }, []);

  const install = async () => {
    haptic.light();
    if (mode === "telegram") {
      setFlag(ASKED_TG);
      // Telegram’ning ichki brauzerida o‘rnatib bo‘lmaydi — Chrome/Safari’ning o‘zini so‘raymiz
      openLink(installUrl(), { tryBrowser: /iphone|ipad|ipod/i.test(navigator.userAgent) ? "safari" : "chrome" });
      setOpen(false);
    } else if (mode === "pwa" && deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === "accepted") {
        setFlag(KEY);
        showToast("YaqinDars telefoningizga o‘rnatildi", "ok");
      }
      setOpen(false);
    } else setOpen(false);
  };

  return (
    <Sheet open={open} onClose={() => setOpen(false)} label="Ilovani o‘rnatish">
      <div className="flex flex-col items-center px-6 pb-2 pt-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[22px] bg-bg shadow-card">
          <LogoMark size={50} />
        </div>
        <h2 className="mt-4 text-title">Ilovani telefoningizga o‘rnatasizmi?</h2>
        <p className="mt-2 text-subhead text-ink2">
          {mode === "telegram"
            ? "YaqinDars bosh ekranda alohida ilova bo‘lib turadi va Telegram’siz ochiladi. O‘rnatish uchun brauzerda ochamiz."
            : "YaqinDars bosh ekranda turadi — markazlar va bo‘sh joylarni bir bosishda ochasiz."}
        </p>

        {mode === "ios" && (
          <ol className="mt-5 w-full space-y-3 rounded-card bg-card2 p-4 text-left text-subhead">
            <li className="flex items-center gap-3">
              <Share size={20} className="shrink-0 text-tint" aria-hidden /> Pastdagi «Ulashish» tugmasini bosing
            </li>
            <li className="flex items-center gap-3">
              <SquarePlus size={20} className="shrink-0 text-tint" aria-hidden /> «Bosh ekranga qo‘shish» ni tanlang
            </li>
          </ol>
        )}

        <div className="mt-6 w-full space-y-2">
          {mode === "ios" ? (
            <Button className="w-full" onClick={() => setOpen(false)}>
              Tushunarli
            </Button>
          ) : (
            <Button className="w-full" onClick={install}>
              {mode === "telegram" ? <ExternalLink size={20} aria-hidden /> : <Smartphone size={20} aria-hidden />}
              {mode === "telegram" ? "Ha, brauzerda o‘rnatish" : "Ha, o‘rnatish"}
            </Button>
          )}
          <Button kind="plain" className="w-full" onClick={() => setOpen(false)}>
            Keyinroq
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
