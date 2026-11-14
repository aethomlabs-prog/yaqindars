/** YaqinDars motion UI — umumiy narsalar */
export const PIN = "M50 4C26 4 8 22 8 46c0 30 42 70 42 70s42-40 42-70C92 22 74 4 50 4Z";
export const BOOK_L = "M33 37Q41 32 49 37.5V58Q41 53 33 57Z";
export const BOOK_R = "M67 37Q59 32 51 37.5V58Q59 53 67 57Z";

type TgHaptic = {
  impactOccurred?: (s: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
  notificationOccurred?: (t: "success" | "error" | "warning") => void;
  selectionChanged?: () => void;
};
const tg = () => (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: TgHaptic } } }).Telegram?.WebApp;

export const haptic = {
  light: () => tg()?.HapticFeedback?.impactOccurred?.("light"),
  success: () => tg()?.HapticFeedback?.notificationOccurred?.("success"),
  error: () => tg()?.HapticFeedback?.notificationOccurred?.("error"),
  select: () => tg()?.HapticFeedback?.selectionChanged?.(),
};

/** Brend belgisi (pin + kitob + yashil nuqta) */
export function Logo({ size = 64, bg = "#1E6FD9", fg = "#fff", dotClass = "" }: { size?: number; bg?: string; fg?: string; dotClass?: string }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 100 120" aria-hidden="true">
      <path d={PIN} fill={fg} />
      <circle cx="50" cy="46" r="27" fill={bg} />
      <path d={BOOK_L} fill={fg} />
      <path d={BOOK_R} fill={fg} />
      <circle className={dotClass} cx="80" cy="16" r="10" fill="#22B573" stroke={bg} strokeWidth="4" />
    </svg>
  );
}
