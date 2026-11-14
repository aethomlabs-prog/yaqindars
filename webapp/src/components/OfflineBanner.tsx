/* Bot (server) javob bermasa — jim mehmon rejimiga o‘tmaymiz: aniq xabar va «Qayta urinish». */
import { RefreshCw, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { useApp } from "../store/app";

export function OfflineBanner() {
  const offline = useApp((s) => !!s.backend?.offline);
  const [hidden, setHidden] = useState(false);
  if (!offline || hidden) return null;
  return (
    <div className="fixed inset-x-3 z-[65] flex items-center gap-3 rounded-[16px] bg-[#3A2A00] px-3.5 py-3 text-white shadow-float" style={{ top: "calc(8px + var(--safe-top))" }} role="alert">
      <WifiOff size={20} className="shrink-0 text-gold" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-subhead font-semibold">Server bilan aloqa yo‘q</div>
        <div className="text-footnote opacity-80">Xarita ishlaydi; chat, arizalar holati va kabinet vaqtincha o‘chiq.</div>
      </div>
      <button onClick={() => location.reload()} className="focus-ring flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 text-footnote font-semibold">
        <RefreshCw size={15} aria-hidden /> Qayta urinish
      </button>
      <button onClick={() => setHidden(true)} aria-label="Yopish" className="flex h-8 w-6 shrink-0 items-center justify-center opacity-70">
        <X size={16} />
      </button>
    </div>
  );
}
