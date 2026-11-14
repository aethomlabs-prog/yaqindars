/* Brauzerda ilovani O‘RNATISH sahifasi (?install=1, Telegram tashqarisida).
 * Telegram ichidagi «Ha, brauzerda o‘rnatish» va botdagi «📲 O‘rnatib olish» shu yerga olib keladi.
 *  - Android/Chrome: katta «O‘rnatish» → tizimning o‘rnatish oynasi → «O‘rnatildi ✅»
 *  - iPhone/Safari: «Ulashish → Bosh ekranga qo‘shish» yo‘riqnomasi
 *  - O‘rnatish oynasi chiqmasa (Telegram ichki brauzeri, eski Chrome): «⋮ → Ilovani o‘rnatish» */
import { CheckCircle2, MoreVertical, Share, Smartphone, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { LogoMark } from "./brand";
import { Button } from "./ios/controls";
import { getInstallPrompt, isStandalone, markInstalled, onInstallPromptReady } from "./InstallPrompt";

type State = "waiting" | "ready" | "ios" | "manual" | "installing" | "done";

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isAndroid = () => /android/i.test(navigator.userAgent);

function openApp() {
  const u = new URL(location.href);
  u.search = "";
  location.replace(u.toString());
}

export default function InstallLanding() {
  const [state, setState] = useState<State>(() => (isStandalone() ? "done" : isIOS() ? "ios" : getInstallPrompt() ? "ready" : "waiting"));

  useEffect(() => {
    if (state !== "waiting") return;
    const off = onInstallPromptReady(() => setState("ready"));
    // Chrome odatda 1–3 s ichida beradi; bo‘lmasa — qo‘lda yo‘riqnoma
    const t = setTimeout(() => setState((s) => (s === "waiting" ? "manual" : s)), 3500);
    return () => {
      off();
      clearTimeout(t);
    };
  }, [state]);

  useEffect(() => {
    const on = () => setState("done");
    window.addEventListener("appinstalled", on);
    return () => window.removeEventListener("appinstalled", on);
  }, []);

  const install = async () => {
    const p = getInstallPrompt();
    if (!p) return setState("manual");
    setState("installing");
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === "accepted") {
      markInstalled();
      setState("done");
    } else setState("ready");
  };

  return (
    <div className="flex flex-col items-center bg-bg px-6 text-center" style={{ minHeight: "var(--vh)", paddingTop: "calc(48px + var(--safe-top))", paddingBottom: "calc(24px + var(--safe-bottom))" }}>
      <div className="flex h-24 w-24 items-center justify-center rounded-[26px] bg-card shadow-card">
        <LogoMark size={60} />
      </div>
      <h1 className="mt-5 text-title">{state === "done" ? "YaqinDars o‘rnatildi" : "YaqinDars ilovasini o‘rnatish"}</h1>
      <p className="mt-2 max-w-[320px] text-subhead text-ink2">
        {state === "done"
          ? "Bosh ekrandagi YaqinDars belgisini bosing — ilova Telegram’siz, alohida oynada ochiladi."
          : "Ilova bosh ekranda turadi va Telegram’siz, bir bosishda ochiladi."}
      </p>

      <div className="mt-8 w-full max-w-[360px]">
        {state === "done" && (
          <div className="flex flex-col items-center">
            <CheckCircle2 size={64} strokeWidth={1.6} className="text-green" style={{ animation: "yd-pop .45s var(--yd-spring) both" }} />
          </div>
        )}

        {(state === "ready" || state === "installing") && (
          <Button kind="green" className="w-full" loading={state === "installing"} onClick={install}>
            <Smartphone size={20} aria-hidden /> O‘rnatish
          </Button>
        )}

        {state === "waiting" && <p className="text-footnote text-ink3">Tayyorlanmoqda…</p>}

        {state === "ios" && (
          <ol className="space-y-3 rounded-card bg-card p-4 text-left text-subhead shadow-card">
            <li className="flex items-center gap-3">
              <Share size={22} className="shrink-0 text-tint" aria-hidden /> Safari pastidagi «Ulashish» tugmasini bosing
            </li>
            <li className="flex items-center gap-3">
              <SquarePlus size={22} className="shrink-0 text-tint" aria-hidden /> «Bosh ekranga qo‘shish» → «Qo‘shish»
            </li>
            <li className="text-footnote text-ink2">Safari’da emas, boshqa brauzerda ochilgan bo‘lsa — havolani Safari’da oching.</li>
          </ol>
        )}

        {state === "manual" && (
          <ol className="space-y-3 rounded-card bg-card p-4 text-left text-subhead shadow-card">
            {isAndroid() && (
              <li className="flex items-start gap-3">
                <MoreVertical size={22} className="mt-0.5 shrink-0 text-tint" aria-hidden />
                <span>
                  Yuqori o‘ngdagi <b>⋮</b> menyusini bosing → <b>«Chrome’da ochish»</b> (Telegram ichida ochilgan bo‘lsa)
                </span>
              </li>
            )}
            <li className="flex items-start gap-3">
              <SquarePlus size={22} className="mt-0.5 shrink-0 text-tint" aria-hidden />
              <span>
                Chrome’da <b>⋮</b> → <b>«Ilovani o‘rnatish»</b> yoki <b>«Bosh ekranga qo‘shish»</b>
              </span>
            </li>
          </ol>
        )}

        <Button kind="plain" className="mt-3 w-full" onClick={openApp}>
          {state === "done" ? "Shu yerda ochish" : "O‘rnatmasdan ochish"}
        </Button>
      </div>
    </div>
  );
}
