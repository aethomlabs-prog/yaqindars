/* «🔔 Shunday joy ochilsa xabar ber»: joriy filtrlar (fan, radius, narx, kunlar) + joylashuv saqlanadi.
 * Bot mos guruhda bo‘sh joy ochilganda Telegram’da yozadi (kuniga 3 tagacha, takrorlanmaydi). */
import { BellPlus, Check } from "lucide-react";
import { useState } from "react";
import { haptic } from "../lib/telegram";
import { watchTitle } from "../lib/watch";
import { useApp, useOrigin } from "../store/app";
import { PRICE_MAX, useFilters } from "../store/filters";
import { useNav } from "../store/nav";
import { Button } from "./ios/controls";

export function WatchButton({ className = "" }: { className?: string }) {
  const backend = useApp((s) => s.backend);
  const showToast = useApp((s) => s.showToast);
  const push = useNav((s) => s.push);
  const f = useFilters();
  const { pos } = useOrigin();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const w = { subject: f.subject, radiusKm: f.radius, maxPrice: f.priceMax < PRICE_MAX ? f.priceMax : null, days: f.days, lat: pos.lat, lng: pos.lng };

  const save = async () => {
    if (!backend?.authed) {
      showToast("Bildirishnoma Telegram ichida ishlaydi — ilovani bot orqali oching.", "info");
      return;
    }
    setState("busy");
    try {
      await backend.addWatch(w);
      setState("done");
      haptic.success();
      showToast("Saqlandi — mos joy ochilsa Telegram’da yozamiz", "ok");
    } catch (e) {
      setState("idle");
      showToast(e instanceof Error && e.message === "limit" ? "10 tadan ortiq kuzatuv saqlab bo‘lmaydi. Profil → Kuzatuvlarim" : "Saqlab bo‘lmadi", "error");
    }
  };

  return (
    <div className={`rounded-card bg-card p-3.5 shadow-card ${className}`}>
      <Button kind="tinted" size="md" className="w-full" disabled={state !== "idle"} loading={state === "busy"} onClick={save}>
        {state === "done" ? <Check size={17} aria-hidden /> : <BellPlus size={17} aria-hidden />} {state === "done" ? "Kuzatilmoqda" : "Shunday joy ochilsa xabar ber"}
      </Button>
      <p className="mt-2 text-center text-caption text-ink2">
        {watchTitle(w)}
        {state === "done" && (
          <>
            {" · "}
            <button className="text-tint" onClick={() => push({ name: "watches" }, "profile")}>
              Kuzatuvlarim
            </button>
          </>
        )}
      </p>
    </div>
  );
}
