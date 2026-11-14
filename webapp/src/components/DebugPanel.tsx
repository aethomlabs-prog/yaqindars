/* ?debug=1 — haqiqiy telefonda tekshirish paneli: Telegram, viewport, joylashuv, auth, bot aloqasi.
 * «Nusxalash» bilan hammasini matn qilib yuborish mumkin. */
import { Bug, ChevronDown, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { initData, inTelegram, tg, tgUser } from "../lib/telegram";
import { useApp } from "../store/app";
import { useNav } from "../store/nav";

export const DEBUG = typeof location !== "undefined" && new URLSearchParams(location.search).has("debug");

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function DebugPanel() {
  useTick(1000);
  const [open, setOpen] = useState(true);
  const [perm, setPerm] = useState("?");
  const backend = useApp((s) => s.backend);
  const centersStatus = useApp((s) => s.centersStatus);
  const centers = useApp((s) => s.centers.length);
  const userPos = useApp((s) => s.userPos);
  const userAcc = useApp((s) => s.userAcc);
  const locStatus = useApp((s) => s.locStatus);
  const tab = useNav((s) => s.tab);

  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((r) => {
        setPerm(r.state);
        r.onchange = () => setPerm(r.state);
      })
      .catch(() => setPerm("noma’lum"));
  }, []);

  const lm = inTelegram && tg?.LocationManager;
  const rows: [string, string][] = [
    ["Muhit", inTelegram ? `Telegram · ${tg.platform} · v${tg.version}` : "brauzer"],
    ["initData", initData ? `bor (${initData.length} belgi)` : "bo‘sh (klaviatura tugmasi yoki brauzer)"],
    ["Foydalanuvchi", tgUser ? `${tgUser.first_name} · ${tgUser.id}` : "—"],
    ["Ekran", `${innerWidth}×${innerHeight} · dpr ${devicePixelRatio}`],
    ["TG viewport", inTelegram ? `${tg.viewportHeight ?? "?"} / barqaror ${tg.viewportStableHeight ?? "?"} · expanded ${tg.isExpanded ? "ha" : "yo‘q"}` : "—"],
    ["Mavzu", `${document.documentElement.dataset.theme} · tg ${tg?.colorScheme ?? "—"}`],
    ["Joylashuv", `${locStatus} · ruxsat: ${perm}${lm ? ` · TG LM: ${lm.isInited ? (lm.isAccessGranted ? "ruxsat bor" : lm.isAccessRequested ? "rad etilgan" : "so‘ralmagan") : "init emas"}` : ""}`],
    ["Koordinata", userPos ? `${userPos.lat.toFixed(5)}, ${userPos.lng.toFixed(5)} ±${userAcc ? Math.round(userAcc) : "?"} m` : "—"],
    ["Backend", backend ? `${backend.mode}${backend.authed ? " · tasdiqlangan" : " · mehmon"}` : "yuklanmoqda…"],
    ["Bot aloqasi", !backend ? "…" : backend.mode === "demo" ? "DEMO" : backend.offline ? "❌ javob bermadi" : backend.authed ? "✅ tasdiqladi" : initData ? "—" : "kerak emas (initData yo‘q)"],
    ["Bot username", backend?.botUsername ? `@${backend.botUsername}` : "—"],
    ["Markazlar", `${centersStatus} · ${centers} ta`],
    ["Ekran (tab)", tab],
    ["Online", navigator.onLine ? "ha" : "yo‘q"]
  ];
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\nUA: ${navigator.userAgent}`;

  return (
    <div className="fixed left-2 z-[90] max-w-[calc(100%-16px)] rounded-[14px] bg-black/85 text-[11px] leading-[15px] text-white shadow-float" style={{ top: "calc(4px + var(--safe-top))" }}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 font-semibold">
        <Bug size={13} aria-hidden /> debug
        <ChevronDown size={13} className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="px-2.5 pb-2">
          <table className="w-full">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="align-top">
                  <td className="whitespace-nowrap pr-2 opacity-60">{k}</td>
                  <td className="break-all font-mono">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => navigator.clipboard?.writeText(text).then(() => useApp.getState().showToast("Debug ma’lumoti nusxalandi", "ok"))}
            className="mt-1.5 flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 font-semibold"
          >
            <Copy size={12} aria-hidden /> Nusxalash
          </button>
        </div>
      )}
    </div>
  );
}
