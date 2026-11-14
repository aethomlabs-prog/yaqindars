/* Internet yo‘q bo‘lsa — modal: «Wi‑Fi yoki mobil internetni tekshiring».
 * navigator.onLine + online/offline hodisalari; «Qayta urinish» haqiqiy so‘rov bilan tekshiradi.
 * Internet qaytsa — o‘zi yopiladi va ma’lumotlar yangilanadi. */
import { RefreshCw, Smartphone, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../store/app";
import { Button } from "./ios/controls";

/** Haqiqiy aloqa: o‘z saytimizdan kichik fayl (keshsiz) */
async function reachable(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`./favicon.svg?ping=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export function NetworkModal() {
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  const back = useCallback(() => {
    setOffline(false);
    setFailed(false);
    const { centersStatus, loadCenters, backend, showToast } = useApp.getState();
    if (backend && centersStatus !== "ready") loadCenters();
    showToast("Internet qaytdi", "ok");
  }, []);

  useEffect(() => {
    const off = () => setOffline(true);
    const on = () => reachable().then((ok) => ok && back());
    addEventListener("offline", off);
    addEventListener("online", on);
    return () => {
      removeEventListener("offline", off);
      removeEventListener("online", on);
    };
  }, [back]);

  const retry = async () => {
    setChecking(true);
    setFailed(false);
    const ok = await reachable();
    setChecking(false);
    if (ok) back();
    else setFailed(true);
  };

  if (!offline) return null;
  return (
    <div className="fixed inset-0 z-[2500] flex items-end justify-center sm:items-center" role="alertdialog" aria-modal="true" aria-labelledby="net-title">
      <div className="absolute inset-0" style={{ background: "var(--overlay)", animation: "yd-fade .2s both" }} />
      <div
        className="relative w-full max-w-[420px] rounded-t-sheet bg-card px-6 pt-7 text-center sm:rounded-sheet"
        style={{ paddingBottom: "calc(20px + var(--safe-bottom))", animation: "yd-up .35s var(--yd-ease) both" }}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-soft text-red-text">
          <WifiOff size={30} aria-hidden />
        </div>
        <h2 id="net-title" className="mt-4 text-title">
          Internet aloqasi yo‘q
        </h2>
        <p className="mt-2 text-subhead text-ink2">Wi‑Fi yoki mobil internetni tekshiring. Saqlangan markazlar ko‘rinib turadi, yangilari internet qaytgach yuklanadi.</p>
        <ul className="mx-auto mt-4 max-w-[300px] space-y-2 rounded-card bg-card2 p-3.5 text-left text-subhead">
          <li className="flex items-center gap-3">
            <Wifi size={19} className="shrink-0 text-tint" aria-hidden /> Wi‑Fi yoqilganini tekshiring
          </li>
          <li className="flex items-center gap-3">
            <Smartphone size={19} className="shrink-0 text-tint" aria-hidden /> Yoki mobil internetni yoqing
          </li>
        </ul>
        {failed && <p className="mt-3 text-footnote text-red-text">Hali ham aloqa yo‘q. Biroz kutib qayta urinib ko‘ring.</p>}
        <div className="mt-5 space-y-2">
          <Button className="w-full" loading={checking} onClick={retry}>
            <RefreshCw size={18} aria-hidden /> Qayta urinish
          </Button>
          <Button kind="plain" className="w-full" onClick={() => setOffline(false)}>
            Internetsiz davom etish
          </Button>
        </div>
      </div>
    </div>
  );
}
