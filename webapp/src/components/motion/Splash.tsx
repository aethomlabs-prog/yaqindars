import { useEffect, useState } from "react";
import { Logo } from "./shared";

/**
 * 1. Ochilish ekrani. ready=true bo‘lganda silliq yo‘qoladi.
 * <Splash ready={authDone} />
 */
export default function Splash({ ready, onDone }: { ready: boolean; onDone?: () => void }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => { setGone(true); onDone?.(); }, 420);
    return () => clearTimeout(t);
  }, [ready, onDone]);
  if (gone) return null;
  return (
    <div className={`yd-splash${ready ? " is-out" : ""}`} role="status" aria-label="Yuklanmoqda">
      <div className="yd-splash-pin"><Logo size={88} dotClass="yd-splash-dot" /></div>
      <div className="yd-splash-word">YaqinDars</div>
      <div className="yd-splash-bar"><i /></div>
    </div>
  );
}
