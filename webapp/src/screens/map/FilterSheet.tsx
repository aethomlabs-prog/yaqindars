/* Filtrlar: narx (ikki tomonlama slayder), kunlar, yosh, radius, faqat bo‘sh joy. */
import { Button, Chip, Switch } from "../../components/ios/controls";
import { Sheet } from "../../components/ios/Sheet";
import { fmtThousand } from "../../lib/format";
import { DAYS } from "../../lib/types";
import { AGE_GROUPS, PRICE_MAX, PRICE_MIN, RADII, useFilters } from "../../store/filters";

const STEP = 25000;

function PriceRange() {
  const min = useFilters((s) => s.priceMin);
  const max = useFilters((s) => s.priceMax);
  const set = useFilters((s) => s.set);
  const pct = (v: number) => ((v - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100;
  const thumb =
    "pointer-events-none absolute inset-0 h-7 w-full appearance-none bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-7 [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-[0_3px_8px_rgba(0,0,0,.2)] [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_3px_8px_rgba(0,0,0,.2),0_0_0_0.5px_rgba(0,0,0,.04)]";
  return (
    <div>
      <div className="tnum mb-3 flex justify-between text-subhead">
        <span>{min <= PRICE_MIN ? "Istalgan" : `${fmtThousand(min)} so‘m`}</span>
        <span>{max >= PRICE_MAX ? `${fmtThousand(PRICE_MAX)}+ so‘m` : `${fmtThousand(max)} so‘m`}</span>
      </div>
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fill" />
        <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-tint" style={{ left: `${pct(min)}%`, right: `${100 - pct(max)}%` }} />
        <input
          type="range"
          aria-label="Eng kam narx"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={STEP}
          value={min}
          onChange={(e) => set({ priceMin: Math.min(Number(e.target.value), max - STEP) })}
          className={thumb}
        />
        <input
          type="range"
          aria-label="Eng ko‘p narx"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={STEP}
          value={max}
          onChange={(e) => set({ priceMax: Math.max(Number(e.target.value), min + STEP) })}
          className={thumb}
        />
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2.5 text-headline">{title}</h3>
      {children}
    </section>
  );
}

export function FilterSheet({ open, onClose, resultCount }: { open: boolean; onClose: () => void; resultCount: number }) {
  const f = useFilters();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtrlar"
      tall
      left={
        <button onClick={f.reset} className="h-11 px-1 text-body text-tint">
          Tozalash
        </button>
      }
      footer={
        <Button className="w-full" onClick={onClose}>
          {resultCount ? `${resultCount} ta markazni ko‘rsatish` : "Mos markaz yo‘q"}
        </Button>
      }
    >
      <div className="px-5 pt-2">
        <Block title="Oylik narx">
          <PriceRange />
        </Block>

        <Block title="Dars kunlari">
          <div className="flex gap-1.5">
            {DAYS.map((d) => {
              const on = f.days.includes(d);
              return (
                <button
                  key={d}
                  aria-pressed={on}
                  onClick={() => f.set({ days: on ? f.days.filter((x) => x !== d) : [...f.days, d] })}
                  className={`focus-ring h-10 flex-1 rounded-[10px] text-subhead font-semibold transition-colors ${on ? "bg-tint text-white" : "bg-fill text-ink"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-footnote text-ink2">Guruh faqat tanlangan kunlarda bo‘lsa ko‘rsatiladi.</p>
        </Block>

        <Block title="Yosh">
          <div className="flex flex-wrap gap-2">
            {AGE_GROUPS.map((a) => (
              <Chip key={a.id} active={f.age === a.id} onClick={() => f.set({ age: f.age === a.id ? null : a.id })}>
                {a.label}
              </Chip>
            ))}
          </div>
        </Block>

        <Block title="Masofa">
          <div className="flex flex-wrap gap-2">
            <Chip active={f.radius === null} onClick={() => f.set({ radius: null })}>
              Hammasi
            </Chip>
            {RADII.map((r) => (
              <Chip key={r.km} active={f.radius === r.km} onClick={() => f.set({ radius: r.km })}>
                {r.label} gacha
              </Chip>
            ))}
          </div>
        </Block>

        <div className="mb-4 flex items-center justify-between rounded-card bg-card2 px-4 py-3">
          <div>
            <div className="text-body">Faqat bo‘sh joy borlari</div>
            <div className="text-footnote text-ink2">To‘lgan guruhlar yashiriladi</div>
          </div>
          <Switch checked={f.freeOnly} onChange={(v) => f.set({ freeOnly: v })} label="Faqat bo‘sh joy" />
        </div>
      </div>
    </Sheet>
  );
}
