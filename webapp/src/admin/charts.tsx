/* Admin grafiklari — kutubxonasiz SVG (dataviz qoidalari: ingichka belgilar, 4px yumaloq uchlar bazaga
 * tayangan, 2px oraliq, xira setka, hover tooltip, jadval ko‘rinishi). Bitta qator — bitta rang (--viz-1). */
import { useMemo, useRef, useState, type ReactNode } from "react";

export interface Point {
  key: string;
  label: string;
  value: number;
}

/** Tooltip — sichqoncha/barmoq ostidagi qiymat */
function Tip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[10px] bg-ink px-2.5 py-1.5 text-footnote text-bg shadow-float"
      style={{ left: x, top: y - 8 }}
      role="status"
    >
      {children}
    </div>
  );
}

const niceMax = (v: number) => {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

/** Vertikal ustunlar (vaqt bo‘yicha). Bitta qator — legend kerak emas, sarlavha nomlaydi. */
export function BarChart({ data, height = 180, unit = "ta", labelEvery = 7 }: { data: Point[]; height?: number; unit?: string; labelEvery?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const pad = { l: 28, r: 6, t: 8, b: 22 };
  const max = useMemo(() => niceMax(Math.max(1, ...data.map((d) => d.value))), [data]);
  const iw = W - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const step = iw / Math.max(1, data.length);
  const bw = Math.max(2, step - 2); // 2px oraliq
  const ticks = [0, max / 2, max];
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const hx = hover !== null ? ((pad.l + hover * step + step / 2) / W) * (box.current?.clientWidth ?? W) : 0;

  return (
    <div ref={box} className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} className="block h-auto w-full" role="img" aria-label="Kunlik arizalar grafigi">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink3)">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * step + 1;
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * ih);
          const top = pad.t + ih - h;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={d.key}>
              {/* faqat yuqori burchaklar yumaloq, pastki tomon bazaga tayangan */}
              {h > 0 && (
                <path
                  d={`M${x},${pad.t + ih} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${pad.t + ih} Z`}
                  fill="var(--viz-1)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {/* hit-target: ustundan kattaroq — butun ustun balandligi */}
              <rect x={pad.l + i * step} y={pad.t} width={step} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
              {/* oxirgi sana — oldingi yorliqqa juda yaqin bo‘lsa chiqarilmaydi (ustma-ust tushmasin) */}
              {(i % labelEvery === 0 || (i === data.length - 1 && i % labelEvery >= Math.ceil(labelEvery / 2))) && (
                <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--ink3)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <Tip x={hx} y={(y(data[hover].value) / height) * (box.current?.clientHeight ?? height)}>
          <b className="tnum">
            {data[hover].value} {unit}
          </b>{" "}
          · {data[hover].label}
        </Tip>
      )}
    </div>
  );
}

/** Gorizontal ro‘yxat-ustunlar (top fanlar, top markazlar). Qiymat va nom — matn rangida. */
export function HBars({ data, color = "var(--viz-1)", unit = "ta", empty = "Ma’lumot yo‘q" }: { data: Point[]; color?: string; unit?: string; empty?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="py-6 text-center text-footnote text-ink3">{empty}</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.key} title={`${d.label}: ${d.value} ${unit}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-subhead">
            <span className="truncate">{d.label}</span>
            <span className="tnum shrink-0 font-semibold">{d.value}</span>
          </div>
          <div className="h-2 rounded-full bg-fill">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (d.value / max) * 100)}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Holatlar: status rangi + belgi + yorliq (rang hech qachon yolg‘iz emas) */
export function StatusBars({ data }: { data: { key: string; label: string; value: number; color: string; icon: ReactNode }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div>
      {/* bitta qatorli taqsimot, segmentlar orasida 2px oraliq */}
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-full" aria-hidden>
        {total > 0 ? data.filter((d) => d.value > 0).map((d) => <div key={d.key} style={{ flexGrow: d.value, background: d.color }} />) : <div className="flex-1 bg-fill" />}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `${d.color}22`, color: d.color }} aria-hidden>
              {d.icon}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-footnote text-ink2">{d.label}</span>
              <span className="tnum block text-headline">
                {d.value}
                <span className="ml-1 text-footnote font-normal text-ink3">{total ? Math.round((d.value / total) * 100) : 0}%</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Grafik ostida «Jadval» — ekran o‘quvchilar va aniq raqamlar uchun */
export function TableView({ rows, head }: { rows: (string | number)[][]; head: string[] }) {
  return (
    <details className="mt-3 text-footnote">
      <summary className="cursor-pointer text-tint">Jadval ko‘rinishi</summary>
      <div className="mt-2 max-h-60 overflow-auto rounded-[12px] bg-card2">
        <table className="w-full">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-ink2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="[box-shadow:inset_0_0.5px_0_var(--sep)]">
                {r.map((c, j) => (
                  <td key={j} className="tnum px-3 py-1.5">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
