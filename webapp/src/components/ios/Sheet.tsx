/* iOS bottom sheet’lar:
 *  - Sheet: modal, kontent balandligida; tutqichdan pastga tortib yopiladi.
 *  - DetentSheet: modal emas, 3 balandlik (peek / yarim / to‘liq), drag + inertsiya.
 */
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, type PanInfo } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBackHandler } from "../../lib/telegram";
import { spring, springValue } from "./motion";

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
  const controls = useDragControls();
  const y = useMotionValue(0);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose();
    else animate(y, 0, springValue);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label ?? title}>
          <motion.div
            className="absolute inset-0"
            style={{ background: "var(--overlay)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-sheet bg-card"
            style={{ y, maxHeight: "92%", height: tall ? "92%" : undefined }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.05, bottom: 0.8 }}
            onDragEnd={onDragEnd}
          >
            <div className="shrink-0 cursor-grab touch-none select-none" onPointerDown={(e) => controls.start(e)}>
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
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
  const controls = useDragControls();
  const y = useMotionValue(max - detents[index]);

  useEffect(() => {
    const c = animate(y, max - detents[index], springValue);
    return () => c.stop();
  }, [index, max, detents, y]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    // inertsiya: tezlikka qarab «otilgan» joyni hisoblaymiz
    const projected = y.get() + info.velocity.y * 0.18;
    const heights = detents.map((d) => max - d);
    let best = 0;
    heights.forEach((h, i) => {
      if (Math.abs(h - projected) < Math.abs(heights[best] - projected)) best = i;
    });
    if (best === index) animate(y, heights[best], springValue);
    onIndexChange(best);
  };

  return (
    <motion.section
      className="absolute inset-x-0 z-30 flex flex-col rounded-t-sheet bg-card"
      style={{ y, height: max, bottom: bottomOffset, boxShadow: "0 -1px 0 var(--line), 0 -2px 10px rgba(0,0,0,.06)" }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: max - detents[0] }}
      dragElastic={0.08}
      dragMomentum={false}
      onDragEnd={onDragEnd}
    >
      <div className="shrink-0 cursor-grab touch-none select-none" onPointerDown={(e) => controls.start(e)}>
        <Handle />
        {header}
      </div>
      <div className="scroll-y no-scrollbar min-h-0 flex-1" style={{ paddingBottom: max - detents[index] }}>
        {children}
      </div>
    </motion.section>
  );
}
