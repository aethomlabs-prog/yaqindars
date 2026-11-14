/* iOS «inset grouped» ro‘yxat: oq yumaloq guruhlar, rangli ikonka kvadrati, chevron; ajratgich ikonkadan keyin boshlanadi. */
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function Section({ header, footer, children, className = "" }: { header?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mx-4 mb-6 ${className}`}>
      {header && <h3 className="mb-1.5 px-4 text-[13px] uppercase tracking-[0.02em] text-ink2">{header}</h3>}
      <div className="overflow-hidden rounded-card bg-card">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-footnote text-ink2">{footer}</p>}
    </section>
  );
}

interface RowProps {
  icon?: ReactNode;
  iconBg?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  right?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  danger?: boolean;
  last?: boolean;
  leading?: ReactNode;
}

export function Row({ icon, iconBg = "#1E6FD9", title, subtitle, value, right, chevron, onClick, danger, leading }: RowProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`group relative flex min-h-[44px] w-full items-center gap-3 pl-4 text-left ${onClick ? "focus-ring active:bg-fill" : ""}`}
    >
      {leading}
      {icon && (
        <span className="flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: iconBg }} aria-hidden>
          {icon}
        </span>
      )}
      <span className="row-body flex min-h-[44px] flex-1 items-center gap-2 py-2.5 pr-4 [box-shadow:inset_0_-0.5px_0_var(--sep)] group-last:shadow-none">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-body ${danger ? "text-red-text" : ""}`}>{title}</span>
          {subtitle && <span className="mt-0.5 block truncate text-footnote text-ink2">{subtitle}</span>}
        </span>
        {value !== undefined && <span className="tnum shrink-0 text-body text-ink2">{value}</span>}
        {right}
        {chevron && <ChevronRight size={18} strokeWidth={2.5} className="shrink-0 text-ink3" aria-hidden />}
      </span>
    </Tag>
  );
}
