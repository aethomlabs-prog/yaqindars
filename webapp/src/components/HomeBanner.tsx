import { useEffect, useRef, useState } from "react";
import "./home-banner.css";

/**
 * YaqinDars — Asosiy ekrandagi animatsion banner (3 slayd).
 * Kutubxonasiz: faqat CSS + inline SVG. ~2 KB gzip.
 * Animatsiyalar faqat transform/opacity — 60 fps, batareyani yemaydi.
 */

type Slide = {
  id: "seats" | "trial" | "owner";
  title: string;
  text: string;
  cta: string;
};

const SLIDES: Slide[] = [
  { id: "seats", title: "Hozir bo‘sh joy bor", text: "Yaqin atrofdagi guruhlar — jonli", cta: "Xaritani ochish" },
  { id: "trial", title: "Bepul sinov darsi", text: "Bir tugma bilan yoziling", cta: "Kurs tanlash" },
  { id: "owner", title: "Markaz egasimisiz?", text: "Birinchi oy bepul · VIP 150 000", cta: "Ulanish" },
];

const PIN = "M50 4C26 4 8 22 8 46c0 30 42 70 42 70s42-40 42-70C92 22 74 4 50 4Z";

function Art({ id }: { id: Slide["id"] }) {
  if (id === "seats")
    return (
      <svg className="hb-art" viewBox="0 0 120 96" aria-hidden="true">
        <path d="M0 70C30 62 60 78 120 66M44 0 36 96M0 34 120 28" className="hb-road" />
        <circle cx="62" cy="52" r="22" className="hb-radar" />
        <circle cx="62" cy="52" r="4" fill="#fff" />
        <g className="hb-pin hb-d1" transform="translate(18 20) scale(.2)"><path d={PIN} fill="#fff" /></g>
        <g className="hb-pin hb-d2" transform="translate(78 10) scale(.24)"><path d={PIN} fill="#22B573" stroke="#fff" strokeWidth="8" /></g>
        <g className="hb-pin hb-d3" transform="translate(92 50) scale(.2)"><path d={PIN} fill="#F5B700" stroke="#fff" strokeWidth="8" /></g>
      </svg>
    );
  if (id === "trial")
    return (
      <svg className="hb-art" viewBox="0 0 120 96" aria-hidden="true">
        <circle cx="60" cy="48" r="30" className="hb-glow" />
        <circle cx="60" cy="48" r="26" fill="#22B573" />
        <path d="M47 49l9 9 18-19" className="hb-check" />
      </svg>
    );
  return (
    <svg className="hb-art" viewBox="0 0 120 96" aria-hidden="true">
      <g className="hb-float" transform="translate(36 8) scale(.48)">
        <path d={PIN} fill="#F5B700" />
        <circle cx="50" cy="46" r="22" fill="#fff" />
        <path d="m50 32 4.2 8.6 9.4 1.4-6.8 6.6 1.6 9.4-8.4-4.4-8.4 4.4 1.6-9.4-6.8-6.6 9.4-1.4z" fill="#F5B700" />
      </g>
      <rect className="hb-shine" x="-40" y="0" width="24" height="96" />
    </svg>
  );
}

export default function HomeBanner({ onAction }: { onAction: (id: Slide["id"]) => void }) {
  const [i, setI] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  // avtomatik aylantirish (5 s); bosilganda/teginilganda to‘xtaydi
  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => {
      if (paused.current || document.hidden) return;
      const next = (i + 1) % SLIDES.length;
      track.current?.scrollTo({ left: next * track.current.clientWidth, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(t);
  }, [i]);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const n = Math.round(el.scrollLeft / el.clientWidth);
    if (n !== i) setI(n);
  };

  return (
    <section className="hb" aria-roledescription="carousel" aria-label="Takliflar">
      <div
        ref={track}
        className="hb-track"
        onScroll={onScroll}
        onPointerDown={() => (paused.current = true)}
        onPointerUp={() => setTimeout(() => (paused.current = false), 4000)}
      >
        {SLIDES.map((s, k) => (
          <article key={s.id} className={`hb-slide hb-${s.id}${k === i ? " is-on" : ""}`} aria-label={`${k + 1} / ${SLIDES.length}`}>
            <div className="hb-copy">
              <h3>{s.title}</h3>
              <p>{s.text}</p>
              <button type="button" onClick={() => onAction(s.id)}>{s.cta}</button>
            </div>
            <Art id={s.id} />
          </article>
        ))}
      </div>
      <div className="hb-dots" aria-hidden="true">
        {SLIDES.map((s, k) => <span key={s.id} className={k === i ? "on" : ""} />)}
      </div>
    </section>
  );
}
