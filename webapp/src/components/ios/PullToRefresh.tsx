/* iOS uslubidagi pull-to-refresh (sahifa eng tepada bo‘lganda pastga tortish). */
import { useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { haptic } from "../../lib/telegram";
import { Spinner } from "./Spinner";

const THRESHOLD = 70;

export function PullToRefresh({
  onRefresh,
  scrollEl,
  children
}: {
  onRefresh?: () => Promise<unknown>;
  scrollEl: MutableRefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [loading, setLoading] = useState(false);
  const start = useRef<number | null>(null);
  const fired = useRef(false);

  if (!onRefresh) return <>{children}</>;

  const onTouchStart = (e: React.TouchEvent) => {
    if ((scrollEl.current?.scrollTop ?? 1) <= 0 && !loading) start.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (start.current === null) return;
    const dy = e.touches[0].clientY - start.current;
    if (dy <= 0) return setPull(0);
    const p = Math.min(110, dy * 0.5);
    setPull(p);
    if (p >= THRESHOLD && !fired.current) {
      fired.current = true;
      haptic.light();
    } else if (p < THRESHOLD) fired.current = false;
  };
  const onTouchEnd = async () => {
    if (start.current === null) return;
    start.current = null;
    if (pull >= THRESHOLD) {
      setLoading(true);
      setPull(56);
      try {
        await onRefresh();
      } finally {
        setLoading(false);
        setPull(0);
        fired.current = false;
      }
    } else setPull(0);
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div className="flex items-end justify-center overflow-hidden text-ink2" style={{ height: pull, transition: start.current === null ? "height .3s" : "none" }} aria-hidden>
        <div className="mb-3" style={{ opacity: Math.min(1, pull / THRESHOLD), transform: `rotate(${pull * 3}deg)` }}>
          <Spinner spinning={loading} />
        </div>
      </div>
      {children}
    </div>
  );
}
