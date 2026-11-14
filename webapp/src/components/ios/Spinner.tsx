/* iOS «activity indicator» — 8 ta tayoqcha */
export function Spinner({ size = 22, spinning = true, className = "" }: { size?: number; spinning?: boolean; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`${spinning ? "ios-spinner" : ""} ${className}`} role="progressbar" aria-label="Yuklanmoqda">
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="11" y="2" width="2" height="6" rx="1" fill="currentColor" opacity={0.25 + (i / 8) * 0.75} transform={`rotate(${i * 45} 12 12)`} />
      ))}
    </svg>
  );
}
