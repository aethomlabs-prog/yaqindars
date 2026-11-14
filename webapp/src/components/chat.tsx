/* iMessage uslubidagi chat bloklari: pufakcha, kun ajratgichi, «yozmoqda…», kiritish paneli. */
import { ArrowUp } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { fmtDayLabel, fmtTime } from "../lib/format";
import { haptic } from "../lib/telegram";

export function Bubble({ mine, text, ms, tail, children }: { mine: boolean; text: string; ms: number; tail: boolean; children?: ReactNode }) {
  return (
    <div
      style={{ animation: "yd-rise .3s var(--yd-ease) both" }}
      className={`flex flex-col ${mine ? "items-end" : "items-start"} ${tail ? "mb-2" : "mb-0.5"}`}
    >
      <div
        className={`max-w-[80%] whitespace-pre-wrap break-words px-3.5 py-2 text-body ${
          mine ? "bg-tint text-white" : "bg-card text-ink"
        } ${tail ? (mine ? "rounded-[20px] rounded-br-[6px]" : "rounded-[20px] rounded-bl-[6px]") : "rounded-[20px]"}`}
      >
        {text}
        <span className={`tnum ml-2 inline-block translate-y-1 text-[11px] ${mine ? "text-white/70" : "text-ink3"}`}>{fmtTime(ms)}</span>
      </div>
      {children}
    </div>
  );
}

export function SystemNote({ text }: { text: string }) {
  return (
    <div className="my-2 flex justify-center">
      <span className="rounded-full bg-fill px-3 py-1 text-caption text-ink2">{text}</span>
    </div>
  );
}

export function DaySeparator({ ms }: { ms: number }) {
  return <div className="mb-2 mt-4 text-center text-caption text-ink3">{fmtDayLabel(ms)}</div>;
}

export function TypingDots() {
  return (
    <div className="mb-2 flex" aria-label="Yozmoqda">
      <div className="rounded-[20px] rounded-bl-[6px] bg-card px-4 py-3.5 text-ink3">
        <span className="app-busy">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

/** Ikki xabar orasidagi kun o‘zgarganmi */
export const newDay = (a: number | undefined, b: number) => !a || new Date(a).toDateString() !== new Date(b).toDateString();

export function Composer({ onSend, disabled, placeholder = "Xabar", busy }: { onSend: (t: string) => void; disabled?: boolean; placeholder?: string; busy?: boolean }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(120, el.scrollHeight) + "px";
  }, [text]);

  const send = () => {
    const t = text.trim();
    if (!t || disabled || busy) return;
    haptic.light();
    onSend(t);
    setText("");
  };

  return (
    <div className="blur-bar hairline-t absolute inset-x-0 bottom-0 z-20 flex items-end gap-2 px-3 pt-2" style={{ paddingBottom: "calc(8px + var(--safe-bottom))" }}>
      <textarea
        ref={ref}
        rows={1}
        value={text}
        disabled={disabled}
        onChange={(e) => setText(e.target.value.slice(0, 2000))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
            e.preventDefault();
            send();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-[36px] flex-1 resize-none rounded-[18px] bg-card px-3.5 py-[7px] text-body leading-[22px] text-ink outline-none shadow-[0_0_0_0.5px_var(--sep)] placeholder:text-ink3 disabled:opacity-50"
      />
      <button
        aria-label="Yuborish"
        onClick={send}
        disabled={!text.trim() || disabled || busy}
        style={{ transform: `scale(${text.trim() ? 1 : 0.85})`, opacity: text.trim() ? 1 : 0.4, transition: "transform .25s cubic-bezier(.3,1.5,.5,1), opacity .2s" }}
        className="focus-ring mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint text-white"
      >
        <ArrowUp size={20} strokeWidth={2.6} />
      </button>
    </div>
  );
}

/** Pastga avtomatik scroll (foydalanuvchi tepaga chiqib o‘qiyotgan bo‘lmasa) */
export function useStickToBottom(dep: unknown) {
  const el = useRef<HTMLDivElement | null>(null);
  const stuck = useRef(true);
  useEffect(() => {
    const n = el.current;
    if (!n) return;
    const on = () => {
      stuck.current = n.scrollHeight - n.scrollTop - n.clientHeight < 80;
    };
    n.addEventListener("scroll", on, { passive: true });
    return () => n.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    const n = el.current;
    if (n && stuck.current) n.scrollTo({ top: n.scrollHeight, behavior: "smooth" });
  }, [dep]);
  const setRef = (n: HTMLDivElement | null) => {
    if (n && !el.current) requestAnimationFrame(() => n.scrollTo({ top: n.scrollHeight }));
    el.current = n;
  };
  return setRef;
}
