import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { haptic } from "./shared";

/**
 * 5. «Dynamic Island» uslubidagi bildirishnoma.
 * <IslandProvider><App/></IslandProvider>
 * const island = useIsland();
 * island({ title: "Joy bo‘shadi!", text: "Ingliz tili · 16:00", onTap: () => openCenter(id) });
 */
export type IslandMsg = {
  title: string;
  text?: string;
  tone?: "success" | "info" | "error";
  duration?: number;
  onTap?: () => void;
};

const Ctx = createContext<(m: IslandMsg) => void>(() => {});
export const useIsland = () => useContext(Ctx);

export function IslandProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<IslandMsg | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();

  const show = useCallback((m: IslandMsg) => {
    setMsg(m);
    setOpen(true);
    if (m.tone === "error") haptic.error(); else haptic.success();
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), m.duration ?? 3800);
  }, []);

  const tone = msg?.tone ?? "success";
  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        className={`yd-island yd-island-${tone}${open ? " is-open" : ""}`}
        role="status"
        aria-live="polite"
        onClick={() => { msg?.onTap?.(); setOpen(false); }}
      >
        <span className="yd-island-dot" />
        <span className="yd-island-body">
          <b>{msg?.title}</b>
          {msg?.text && <small>{msg.text}</small>}
        </span>
      </div>
    </Ctx.Provider>
  );
}
