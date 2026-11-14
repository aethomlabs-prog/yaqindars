import type { ReactNode, TouchEvent } from "react";
import { useRef, useState } from "react";
import { haptic, PIN } from "./shared";

/**
 * 9. Pastga tortib yangilash — pin sakraydi.
 * Muhim: Telegram’da WebApp.disableVerticalSwipes() chaqirilgan bo‘lsin,
 * aks holda pastga tortish Mini App’ni yopadi.
 * <PullToRefresh onRefresh={reload}>…ro‘yxat…</PullToRefresh>
 */
const MAX = 96;
const TRIGGER = 64;

export default function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<number | null>(null);
  const armed = useRef(false);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const onStart = (e: TouchEvent) => {
    if (busy || (box.current?.scrollTop ?? 0) > 0) return;
    start.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onMove = (e: TouchEvent) => {
    if (start.current == null) return;
    const d = e.touches[0].clientY - start.current;
    if (d <= 0) { setPull(0); return; }
    const p = Math.min(MAX, d * 0.5);
    if (p >= TRIGGER && !armed.current) { armed.current = true; haptic.light(); }
    if (p < TRIGGER) armed.current = false;
    setPull(p);
  };
  const onEnd = async () => {
    if (start.current == null) return;
    start.current = null;
    setDragging(false);
    if (pull >= TRIGGER) {
      setBusy(true);
      setPull(56);
      try { await onRefresh(); } finally { setBusy(false); setPull(0); armed.current = false; }
    } else setPull(0);
  };

  const t = dragging ? "none" : "transform .32s cubic-bezier(.2,.8,.2,1)";
  return (
    <div ref={box} className="yd-ptr" onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
      <div
        className={`yd-ptr-ind${busy ? " is-busy" : ""}`}
        style={{ transform: `translate(-50%, ${pull - 44}px) rotate(${busy ? 0 : (pull / TRIGGER) * 18 - 18}deg)`, opacity: Math.min(1, pull / 40), transition: t }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 100 120" width="26" height="31"><path d={PIN} /><circle cx="50" cy="46" r="18" fill="#fff" /></svg>
      </div>
      <div className="yd-ptr-body" style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: t }}>
        {children}
      </div>
    </div>
  );
}
