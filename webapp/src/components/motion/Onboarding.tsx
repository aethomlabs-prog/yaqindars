import type { TouchEvent } from "react";
import { useRef, useState } from "react";
import { haptic, PIN } from "./shared";

/**
 * 10. Birinchi ochilishda 3 ta tanishtiruv ekrani.
 * {shouldShowOnboarding() && <Onboarding onDone={() => setShow(false)} />}
 */
const KEY = "yd_onboarded_v1";
export function shouldShowOnboarding(): boolean {
  try { return !localStorage.getItem(KEY); } catch { return false; }
}

const SLIDES = [
  { id: "map", title: "Yaqin kurslar — xaritada", text: "Uyingiz atrofidagi o‘quv markazlari, to‘garaklar va repetitorlar bir joyda" },
  { id: "seats", title: "Bo‘sh joylar — jonli", text: "Guruhda joy borligini qo‘ng‘iroqsiz bilasiz. Narx va dars vaqti ham shu yerda" },
  { id: "trial", title: "Bepul sinov darsi", text: "Bir tugma bilan yoziling — markaz o‘zi siz bilan bog‘lanadi" },
] as const;

function Art({ id }: { id: (typeof SLIDES)[number]["id"] }) {
  if (id === "map")
    return (
      <svg viewBox="0 0 220 180" aria-hidden="true">
        <rect x="10" y="10" width="200" height="160" rx="28" fill="#E3EEFC" />
        <path d="M10 120C70 104 130 132 210 112M80 10 66 170M10 64 210 54" stroke="#fff" strokeWidth="10" fill="none" />
        <circle cx="112" cy="96" r="30" className="yd-ob-radar" />
        <circle cx="112" cy="96" r="7" fill="#1E6FD9" stroke="#fff" strokeWidth="3" />
        <g transform="translate(40 38) scale(.32)"><g className="yd-ob-pin d1"><path d={PIN} fill="#1E6FD9" /></g></g>
        <g transform="translate(140 24) scale(.38)"><g className="yd-ob-pin d2"><path d={PIN} fill="#22B573" /></g></g>
        <g transform="translate(160 96) scale(.32)"><g className="yd-ob-pin d3"><path d={PIN} fill="#F5B700" /></g></g>
      </svg>
    );
  if (id === "seats")
    return (
      <svg viewBox="0 0 220 180" aria-hidden="true">
        <rect x="30" y="34" width="160" height="112" rx="22" fill="#fff" stroke="#D6DEEA" strokeWidth="3" />
        <rect x="50" y="56" width="80" height="12" rx="6" fill="#0F3D7A" />
        <rect x="50" y="78" width="110" height="9" rx="4.5" fill="#D6DEEA" />
        <rect x="50" y="108" width="96" height="24" rx="12" fill="#E4F6EC" />
        <circle cx="64" cy="120" r="5" fill="#22B573" className="yd-ob-blink" />
        <rect x="76" y="116" width="56" height="8" rx="4" fill="#13804F" />
      </svg>
    );
  return (
    <svg viewBox="0 0 220 180" aria-hidden="true">
      <circle cx="110" cy="90" r="62" fill="#E4F6EC" className="yd-ob-glow" />
      <circle cx="110" cy="90" r="46" fill="#22B573" />
      <path d="M88 91l15 15 30-32" fill="none" stroke="#fff" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" className="yd-ob-check" />
    </svg>
  );
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const x0 = useRef<number | null>(null);
  const last = i === SLIDES.length - 1;

  const finish = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* storage yo‘q bo‘lishi mumkin */ }
    haptic.success();
    onDone();
  };
  const go = (n: number) => { setI(Math.max(0, Math.min(SLIDES.length - 1, n))); haptic.select(); };
  const onStart = (e: TouchEvent) => { x0.current = e.touches[0].clientX; };
  const onEnd = (e: TouchEvent) => {
    if (x0.current == null) return;
    const d = e.changedTouches[0].clientX - x0.current;
    x0.current = null;
    if (Math.abs(d) > 50) go(i + (d < 0 ? 1 : -1));
  };

  return (
    <div className="yd-ob" role="dialog" aria-modal="true" aria-label="Tanishtiruv">
      <button type="button" className="yd-ob-skip" onClick={finish}>O‘tkazib yuborish</button>
      <div className="yd-ob-viewport" onTouchStart={onStart} onTouchEnd={onEnd}>
        <div className="yd-ob-track" style={{ transform: `translateX(${-i * 100}%)` }}>
          {SLIDES.map((s, k) => (
            <section key={s.id} className={`yd-ob-slide${k === i ? " is-on" : ""}`} aria-hidden={k !== i}>
              <div className="yd-ob-art"><Art id={s.id} /></div>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </section>
          ))}
        </div>
      </div>
      <div className="yd-ob-dots" aria-hidden="true">
        {SLIDES.map((s, k) => <span key={s.id} className={k === i ? "on" : ""} />)}
      </div>
      <button type="button" className="yd-btn yd-ob-next" onClick={() => (last ? finish() : go(i + 1))}>
        {last ? "Boshlash" : "Keyingi"}
      </button>
    </div>
  );
}
