import type { CSSProperties } from "react";
import { useEffect } from "react";
import { haptic } from "./shared";

/**
 * 2. Ariza yuborilgandan keyingi ekran: ✓ chiziladi, konfetti uchadi.
 * <SuccessSheet open details={[{label:"Markaz",value:"…"}]} onClose={…} />
 */
type Props = {
  open: boolean;
  title?: string;
  text?: string;
  details?: { label: string; value: string }[];
  actionLabel?: string;
  onClose: () => void;
};

const COLORS = ["#22B573", "#F5B700", "#1E6FD9", "#F25C3B"];
const BITS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + 0.3;
  const d = 70 + (i % 3) * 22;
  return {
    "--x": `${Math.cos(a) * d}px`,
    "--y": `${Math.sin(a) * d}px`,
    "--r": `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
    "--c": COLORS[i % 4],
    animationDelay: `${0.25 + (i % 4) * 0.03}s`,
    borderRadius: i % 2 ? "50%" : "2px",
  } as CSSProperties;
});

export default function SuccessSheet({
  open,
  title = "Ariza yuborildi!",
  text = "Markaz siz bilan tez orada bog‘lanadi",
  details = [],
  actionLabel = "Yaxshi",
  onClose,
}: Props) {
  useEffect(() => { if (open) haptic.success(); }, [open]);
  if (!open) return null;
  return (
    <div className="yd-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="yd-sheet yd-success" role="dialog" aria-modal="true" aria-label={title}>
        <div className="yd-success-art">
          <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="yd-success-ring" cx="60" cy="60" r="56" />
            <circle className="yd-success-disc" cx="60" cy="60" r="46" />
            <path className="yd-success-check" d="M40 61l14 14 27-29" />
          </svg>
          <div className="yd-conf">{BITS.map((s, i) => <i key={i} style={s} />)}</div>
        </div>
        <h2 className="yd-success-title">{title}</h2>
        <p className="yd-success-text">{text}</p>
        {details.length > 0 && (
          <dl className="yd-success-card">
            {details.map((d) => (
              <div key={d.label}><dt>{d.label}</dt><dd>{d.value}</dd></div>
            ))}
          </dl>
        )}
        <button type="button" className="yd-btn" onClick={onClose}>{actionLabel}</button>
      </div>
    </div>
  );
}
