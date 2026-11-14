import { useEffect, useRef, useState } from "react";

/**
 * 8. Bo‘sh joy chipi — raqam o‘zgarganda aylanib almashadi.
 * <SeatChip count={group.freeSeats} />
 */
export default function SeatChip({ count }: { count: number }) {
  const prev = useRef(count);
  const [roll, setRoll] = useState<{ from: number; up: boolean } | null>(null);

  useEffect(() => {
    if (prev.current === count) return;
    setRoll({ from: prev.current, up: count > prev.current });
    prev.current = count;
    const t = setTimeout(() => setRoll(null), 420);
    return () => clearTimeout(t);
  }, [count]);

  if (count <= 0)
    return <span className="yd-seat is-full">Joy qolmadi</span>;

  return (
    <span className="yd-seat" aria-label={`${count} ta bo‘sh joy`}>
      <i className="yd-seat-dot" />
      <span className="yd-roll" aria-hidden="true">
        {roll && roll.from > 0 && <b className={`yd-roll-out${roll.up ? " up" : ""}`}>{roll.from}</b>}
        <b className={roll ? `yd-roll-in${roll.up ? " up" : ""}` : ""}>{count}</b>
      </span>
      <span aria-hidden="true">ta joy</span>
    </span>
  );
}
