/* iOS sahifa: Large Title — scroll qilinganda kichrayib markazdagi sarlavhaga aylanadi, header blur bo‘ladi. */
import { ChevronLeft } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode, type UIEvent } from "react";
import { useNav } from "../../store/nav";
import { PullToRefresh } from "./PullToRefresh";

interface Props {
  title: string;
  /** Large Title (tab ildiz sahifalari). false — ichki sahifa, sarlavha doim markazda */
  large?: boolean;
  /** Large Title o‘rniga maxsus katta sarlavha bloki */
  largeContent?: ReactNode;
  back?: boolean;
  backLabel?: string;
  right?: ReactNode;
  /** sarlavha ostidagi qism (search bar) */
  below?: ReactNode;
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  /** pastki tab bar uchun joy */
  tabbar?: boolean;
  bottom?: ReactNode;
  scrollRef?: (el: HTMLDivElement | null) => void;
}

export function Page({ title, large = false, largeContent, back, backLabel = "Orqaga", right, below, children, onRefresh, tabbar = true, bottom, scrollRef }: Props) {
  const [collapsed, setCollapsed] = useState(!large);
  const [scrolled, setScrolled] = useState(false);
  const raf = useRef(0);
  const el = useRef<HTMLDivElement | null>(null);
  const pop = useNav((s) => s.pop);

  const onScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const top = e.currentTarget.scrollTop;
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        setScrolled(top > 2);
        if (large) setCollapsed(top > 38);
      });
    },
    [large]
  );

  return (
    <div className="absolute inset-0 flex flex-col bg-bg">
      {/* Kichik navigatsiya paneli */}
      <header
        className={`absolute inset-x-0 top-0 z-20 transition-[background,box-shadow] duration-200 ${scrolled ? "blur-bar hairline-b" : ""}`}
        style={{ paddingTop: "var(--safe-top)" }}
      >
        <div className="relative flex h-11 items-center justify-between px-2">
          <div className="flex min-w-[44px] items-center">
            {back && (
              <button onClick={pop} className="focus-ring flex h-11 items-center pr-2 text-tint pressable" aria-label="Orqaga">
                <ChevronLeft size={28} strokeWidth={2.2} className="-ml-1" />
                <span className="text-body -ml-0.5">{backLabel}</span>
              </button>
            )}
          </div>
          <h1
            className={`pointer-events-none absolute left-1/2 max-w-[60%] -translate-x-1/2 truncate text-headline transition-opacity duration-200 ${collapsed ? "opacity-100" : "opacity-0"}`}
            aria-hidden={!collapsed}
          >
            {title}
          </h1>
          <div className="flex min-w-[44px] items-center justify-end gap-1">{right}</div>
        </div>
      </header>

      <div
        ref={(n) => {
          el.current = n;
          scrollRef?.(n);
        }}
        onScroll={onScroll}
        className="scroll-y no-scrollbar relative flex-1"
        style={{ paddingTop: "calc(44px + var(--safe-top))", paddingBottom: tabbar ? "calc(var(--tabbar-h) + 24px)" : "calc(24px + var(--safe-bottom))" }}
      >
        <PullToRefresh onRefresh={onRefresh} scrollEl={el}>
          {large && (
            <div className="px-5 pb-2 pt-1">
              {largeContent ?? <h1 className="text-large-title">{title}</h1>}
            </div>
          )}
          {below}
          {children}
        </PullToRefresh>
      </div>
      {bottom}
    </div>
  );
}

export function NavIconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} onClick={onClick} className="focus-ring flex h-11 w-11 items-center justify-center rounded-full text-tint pressable">
      {children}
    </button>
  );
}
