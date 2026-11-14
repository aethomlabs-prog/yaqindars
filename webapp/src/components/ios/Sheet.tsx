/* iOS bottom sheet’lar — kutubxonasiz (pointer hodisalari + CSS transition):
 *  - Sheet: modal, kontent balandligida; tutqichdan pastga tortib yopiladi.
 *  - DetentSheet: modal emas, 3 balandlik (peek / yarim / to‘liq), drag + inertsiya.
 */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBackHandler } from "../../lib/telegram";

const EASE = "cubic-bezier(.32,.72,0,1)";

export function useViewportHeight() {
  const [h, setH] = useState(() => window.innerHeight);
  useEffect(() => {
    const on = () => setH(window.innerHeight);
    window.addEventListener("resize", on);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.WebApp;
    tg?.onEvent?.("viewportChanged", on);
    return () => {
      window.removeEventListener("resize", on);
      tg?.offEvent?.("viewportChanged", on);
    };
  }, []);
  return h;
}

function Handle() {
  return <div className="mx-auto mt-2 h-[5px] w-9 rounded-full bg-ink3/40" aria-hidden />;
}

/** Vertikal tortish: dy (px) va tezlik (px/ms) */
function useDrag(onEnd: (dy: number, velocity: number) => void, onMove: (dy: number) => void) {
  const s = useRef<{ y: number; t: number; lastY: number; lastT: number } | null>(null);
  return {
    onPointerDown: (e: RPointerEvent<HTMLElement>) => {
      // Sarlavhadagi tugmalar (Bekor/Saqlash) bosilsin — ular ustida tortish boshlanmaydi
      if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [role='button']")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      s.current = { y: e.clientY, t: e.timeStamp, lastY: e.clientY, lastT: e.timeStamp };
    },
    onPointerMove: (e: RPointerEvent<HTMLElement>) => {
      if (!s.current) return;
      s.current.lastY = e.clientY;
      s.current.lastT = e.timeStamp;
      onMove(e.clientY - s.current.y);
    },
    onPointerUp: (e: RPointerEvent<HTMLElement>) => {
      if (!s.current) return;
      const { y, t } = s.current;
      s.current = null;
      const dy = e.clientY - y;
      onEnd(dy, dy / Math.max(1, e.timeStamp - t));
    },
    onPointerCancel: () => {
      if (s.current) onEnd(0, 0);
      s.current = null;
    }
  };
}

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** sarlavha qatoridagi chap/o‘ng tugmalar */
  left?: ReactNode;
  right?: ReactNode;
  /** to‘liq balandlik (92%) */
  tall?: boolean;
  footer?: ReactNode;
  label?: string;
}

export function Sheet({ open, onClose, children, title, left, right, tall, footer, label }: SheetProps) {
  useBackHandler(open, onClose);
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);

  // Ochilish/yopilish animatsiyasi: yopilganda 300 ms DOM’da qoladi
  useEffect(() => {
    if (open) {
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 320);
    return () => clearTimeout(t);
  }, [open]);

  const handlers = useDrag(
    (dy, v) => {
      setDrag(null);
      if (dy > 110 || v > 0.6) onClose();
    },
    (dy) => setDrag(Math.max(-12, dy))
  );

  if (!mounted) return null;
  const y = !shown ? "100%" : drag !== null ? `${drag}px` : "0px";
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label ?? title}>
      <div className="absolute inset-0" style={{ background: "var(--overlay)", opacity: shown ? 1 : 0, transition: "opacity .25s" }} onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-sheet bg-card"
        style={{ maxHeight: "92%", height: tall ? "92%" : undefined, transform: `translateY(${y})`, transition: drag !== null ? "none" : `transform .34s ${EASE}` }}
      >
        <div className="shrink-0 cursor-grab touch-none select-none" {...handlers}>
          <Handle />
          {(title || left || right) && (
            <div className="relative flex h-12 items-center justify-between px-3">
              <div className="min-w-[60px]">{left}</div>
              {title && <h2 className="absolute left-1/2 max-w-[60%] -translate-x-1/2 truncate text-headline">{title}</h2>}
              <div className="flex min-w-[60px] justify-end">{right}</div>
            </div>
          )}
        </div>
        <div className="scroll-y no-scrollbar min-h-0 flex-1">{children}</div>
        {footer && (
          <div className="shrink-0 px-4 pt-2" style={{ paddingBottom: "calc(12px + var(--safe-bottom))" }}>
            {footer}
          </div>
        )}
        {!footer && <div className="shrink-0" style={{ height: "calc(8px + var(--safe-bottom))" }} />}
      </div>
    </div>,
    document.body
  );
}

interface DetentProps {
  /** balandliklar px’da, o‘sish tartibida */
  detents: number[];
  index: number;
  onIndexChange: (i: number) => void;
  header: ReactNode;
  children: ReactNode;
  bottomOffset?: number;
}

export function DetentSheet({ detents, index, onIndexChange, header, children, bottomOffset = 0 }: DetentProps) {
  const max = detents[detents.length - 1];
  const base = max - detents[index];
  const [drag, setDrag] = useState<number | null>(null);

  const handlers = useDrag(
    (dy, v) => {
      setDrag(null);
      // inertsiya: tezlikka qarab «otilgan» joyni hisoblaymiz
      const projected = base + dy + v * 180;
      const heights = detents.map((d) => max - d);
      let best = 0;
      heights.forEach((h, i) => {
        if (Math.abs(h - projected) < Math.abs(heights[best] - projected)) best = i;
      });
      onIndexChange(best);
    },
    (dy) => setDrag(Math.min(max - detents[0], Math.max(-8, base + dy)))
  );

  const y = drag ?? base;
  return (
    <section
      className="absolute inset-x-0 z-30 flex flex-col rounded-t-sheet bg-card"
      style={{
        height: max,
        bottom: bottomOffset,
        transform: `translateY(${y}px)`,
        transition: drag !== null ? "none" : `transform .38s ${EASE}`,
        boxShadow: "0 -1px 0 var(--line), 0 -2px 10px rgba(0,0,0,.06)"
      }}
    >
      <div className="shrink-0 cursor-grab touch-none select-none" {...handlers}>
        <Handle />
        {header}
      </div>
      <div className="scroll-y no-scrollbar min-h-0 flex-1" style={{ paddingBottom: base }}>
        {children}
      </div>
    </section>
  );
}
