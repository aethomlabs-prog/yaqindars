/* Rasmlar karuseli: barmoq bilan suriladi (scroll-snap), pastda nuqtalar, yuqorida «1/3». Kutubxonasiz. */
import { useRef, useState } from "react";

export function Carousel({ photos, alt }: { photos: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const go = (k: number) => {
    const el = box.current;
    if (el) el.scrollTo({ left: k * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="relative overflow-hidden rounded-[20px] bg-card2" role="region" aria-roledescription="karusel" aria-label={`${alt} rasmlari`}>
      <div
        ref={box}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
        onScroll={(e) => {
          const el = e.currentTarget;
          setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        }}
      >
        {photos.map((src, k) => (
          <img
            key={k}
            src={src}
            alt={`${alt} — ${k + 1}-rasm`}
            className="aspect-[4/3] w-full shrink-0 snap-center object-cover"
            loading={k === 0 ? "eager" : "lazy"}
            draggable={false}
          />
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <span className="tnum absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-caption font-semibold text-white">
            {i + 1}/{photos.length}
          </span>
          <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
            {photos.map((_, k) => (
              <button
                key={k}
                aria-label={`${k + 1}-rasm`}
                aria-current={k === i}
                onClick={() => go(k)}
                className={`h-1.5 rounded-full transition-all ${k === i ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
