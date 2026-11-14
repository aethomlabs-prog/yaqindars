/* «Ilovani telefoningizga o‘rnatasizmi?» — har ochilganda 4,5 soniyadan keyin, toki o‘rnatilmaguncha.
 * Telegram ichida: Telegram’ning «Bosh ekranga qo‘shish» (Bot API 8.0+).
 * Brauzerda: PWA o‘rnatish (Android/Chrome) yoki iPhone uchun yo‘riqnoma. O‘rnatilgandan keyin boshqa chiqmaydi. */
import { Share, Smartphone, SquarePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addToHomeScreen, checkHomeScreen, haptic, inTelegram } from "../lib/telegram";
import { useApp } from "../store/app";
import { LogoMark } from "./brand";
import { Button } from "./ios/controls";
import { Sheet } from "./ios/Sheet";

const KEY = "yd-installed";
// ?install=1 (botdagi «📲 Ilovani o‘rnatish» tugmasi) — taklif darhol chiqadi
const FORCE = typeof location !== "undefined" && new URLSearchParams(location.search).has("install");
const DELAY = FORCE ? 600 : 4500;

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const isInstalled = () => {
  try {
    if (localStorage.getItem(KEY) === "1") return true;
  } catch {
    /* private rejim */
  }
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
};
const markInstalled = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* private rejim */
  }
};
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// beforeinstallprompt sahifa yuklanishi bilan keladi — komponentdan oldin ushlab qolamiz
let deferred: BIPEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
  });
  window.addEventListener("appinstalled", markInstalled);
}

export function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"telegram" | "pwa" | "ios">("telegram");
  const showToast = useApp((s) => s.showToast);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (isInstalled() && !FORCE) return;
    started.current = true;
    const t = setTimeout(async () => {
      if (inTelegram) {
        const st = await checkHomeScreen();
        if (st === "added") {
          markInstalled();
          if (FORCE) showToast("YaqinDars telefoningizda allaqachon o‘rnatilgan ✅", "ok");
          return;
        }
        if (st === "unsupported") return; // eski Telegram — taklif qilib bo‘lmaydi
        setMode("telegram");
      } else if (deferred) setMode("pwa");
      else if (isIOS()) setMode("ios");
      else return;
      setOpen(true);
    }, DELAY);
    return () => clearTimeout(t);
  }, [showToast]);

  const install = async () => {
    haptic.light();
    if (mode === "telegram") {
      addToHomeScreen(() => {
        markInstalled();
        showToast("YaqinDars telefoningizga o‘rnatildi", "ok");
      });
      setOpen(false);
    } else if (mode === "pwa" && deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === "accepted") {
        markInstalled();
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
        <p className="mt-2 text-subhead text-ink2">YaqinDars bosh ekranda turadi — markazlar va bo‘sh joylarni bir bosishda ochasiz.</p>

        {mode === "ios" ? (
          <ol className="mt-5 w-full space-y-3 rounded-card bg-card2 p-4 text-left text-subhead">
            <li className="flex items-center gap-3">
              <Share size={20} className="shrink-0 text-tint" aria-hidden /> Pastdagi «Ulashish» tugmasini bosing
            </li>
            <li className="flex items-center gap-3">
              <SquarePlus size={20} className="shrink-0 text-tint" aria-hidden /> «Bosh ekranga qo‘shish» ni tanlang
            </li>
          </ol>
        ) : null}

        <div className="mt-6 w-full space-y-2">
          {mode === "ios" ? (
            <Button
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Tushunarli
            </Button>
          ) : (
            <Button className="w-full" onClick={install}>
              <Smartphone size={20} aria-hidden /> Ha, o‘rnatish
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
