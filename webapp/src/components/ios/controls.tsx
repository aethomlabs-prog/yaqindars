/* Kichik iOS boshqaruv elementlari: Segmented, Switch, Chip, Badge, Button, SearchBar, Avatar.
 * Animatsiyalar kutubxonasiz — CSS transition. Bo‘sh holat, skelet, bo‘sh joy chipi: components/motion. */
import { Search, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { haptic } from "../../lib/telegram";
import { initials } from "../../lib/format";

const EASE = "cubic-bezier(.3,1.3,.5,1)";

/* ---------- Segmented control ---------- */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div role="tablist" aria-label={label} className="relative flex rounded-[9px] bg-fill p-[2px]">
      <span
        aria-hidden
        className="absolute bottom-[2px] left-[2px] top-[2px] rounded-[7px] bg-card shadow-[0_3px_8px_rgba(0,0,0,.12),0_3px_1px_rgba(0,0,0,.04)] dark:bg-[#636366]"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${idx * 100}%)`, transition: `transform .32s ${EASE}` }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) {
                haptic.selection();
                onChange(o.value);
              }
            }}
            className="focus-ring relative h-8 flex-1 rounded-[7px] text-[13px] font-semibold"
          >
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Switch ---------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => {
        haptic.light();
        onChange(!checked);
      }}
      className={`focus-ring relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${checked ? "bg-[#34C759]" : "bg-fill"}`}
    >
      <span
        className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_3px_1px_rgba(0,0,0,.06)]"
        style={{ transform: `translateX(${checked ? 20 : 0}px)`, transition: `transform .3s ${EASE}` }}
      />
    </button>
  );
}

/* ---------- Chip ---------- */
export function Chip({ active, onClick, children, label }: { active?: boolean; onClick?: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      aria-pressed={active}
      aria-label={label}
      onClick={() => {
        haptic.selection();
        onClick?.();
      }}
      className={`focus-ring pressable flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-subhead font-medium transition-colors ${
        active ? "bg-tint text-white" : "bg-card text-ink shadow-card"
      }`}
    >
      {children}
    </button>
  );
}

export function VipBadge({ large }: { large?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-gold-soft font-semibold text-gold-text ${large ? "h-6 px-2.5 text-[13px]" : "h-5 px-2 text-[11px]"}`}>
      <svg width={large ? 12 : 10} height={large ? 12 : 10} viewBox="0 0 24 24" aria-hidden>
        <path fill="#F5B700" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5-4.9-4.6 6.6-.8z" />
      </svg>
      VIP
    </span>
  );
}

export function CountBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-tint px-1.5 text-[12px] font-semibold text-white">{n > 99 ? "99+" : n}</span>;
}

/* ---------- Tugma ---------- */
type BtnKind = "primary" | "green" | "tinted" | "plain" | "gray";
export function Button({
  kind = "primary",
  children,
  onClick,
  disabled,
  loading,
  className = "",
  type = "button",
  size = "lg"
}: {
  kind?: BtnKind;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: "button" | "submit";
  size?: "lg" | "md";
}) {
  const styles: Record<BtnKind, string> = {
    primary: "bg-tint text-white",
    green: "bg-[#13804F] text-white",
    tinted: "bg-tint/10 text-tint",
    plain: "text-tint",
    gray: "bg-fill text-ink"
  };
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={() => {
        haptic.light();
        onClick?.();
      }}
      className={`focus-ring pressable inline-flex items-center justify-center gap-2 rounded-btn font-semibold disabled:opacity-40 ${
        size === "lg" ? "h-[50px] px-5 text-[17px]" : "h-11 px-4 text-[15px]"
      } ${styles[kind]} ${className}`}
    >
      {loading ? (
        <span className="app-busy" role="progressbar" aria-label="Yuklanmoqda">
          <i />
          <i />
          <i />
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/* ---------- Search bar ---------- */
export function SearchBar({
  value,
  onChange,
  placeholder = "Qidirish",
  onFocusChange,
  autoFocus,
  asButton,
  onPress,
  onSubmit
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  onFocusChange?: (f: boolean) => void;
  autoFocus?: boolean;
  asButton?: boolean;
  onPress?: () => void;
  onSubmit?: (v: string) => void;
}) {
  const [focused, setFocused] = useState(!!autoFocus);
  const ref = useRef<HTMLInputElement>(null);
  if (asButton)
    return (
      <button onClick={onPress} className="focus-ring flex h-9 w-full items-center gap-1.5 rounded-[10px] bg-fill px-2 text-left text-body text-ink2">
        <Search size={17} strokeWidth={2.2} className="text-ink2" aria-hidden />
        <span className="truncate text-[17px]">{placeholder}</span>
      </button>
    );
  return (
    <form
      className="flex items-center gap-2"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(value ?? "");
        ref.current?.blur();
      }}
    >
      <label className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-fill px-2">
        <Search size={17} strokeWidth={2.2} className="shrink-0 text-ink2" aria-hidden />
        <input
          ref={ref}
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => {
            setFocused(true);
            onFocusChange?.(true);
          }}
          onBlur={() => onFocusChange?.(false)}
          placeholder={placeholder}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-ink2"
          aria-label={placeholder}
        />
        {!!value && (
          <button type="button" aria-label="Tozalash" onClick={() => onChange?.("")} className="flex h-5 w-5 items-center justify-center rounded-full bg-ink3/60 text-card">
            <X size={12} strokeWidth={3} />
          </button>
        )}
      </label>
      {focused && (
        <button
          type="button"
          style={{ animation: "yd-fade .25s both" }}
          className="shrink-0 whitespace-nowrap text-body text-tint"
          onClick={() => {
            onChange?.("");
            setFocused(false);
            onFocusChange?.(false);
            ref.current?.blur();
          }}
        >
          Bekor qilish
        </button>
      )}
    </form>
  );
}

/* ---------- Avatar ---------- */
const AV_COLORS = ["#1E6FD9", "#0F3D7A", "#13804F", "#7C3AED", "#C2410C", "#0E7490"];
export function Avatar({ name, src, size = 44, color }: { name: string; src?: string | null; size?: number; color?: string }) {
  const [failed, setFailed] = useState(false);
  const bg = color ?? AV_COLORS[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AV_COLORS.length];
  if (src && !failed)
    return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: bg, fontSize: size * 0.38 }} aria-hidden>
      {initials(name)}
    </div>
  );
}
