/* AI yordamchi: erkin savol → javob + mos markaz kartochkalari. LLM bo‘lmasa — qoidaga asoslangan qidiruv. */
import { Sparkles, Trash2 } from "lucide-react";
import { SeatChip } from "../../components/motion";
import { Fragment, useState } from "react";
import { Bubble, Composer, DaySeparator, newDay, TypingDots, useStickToBottom } from "../../components/chat";
import { SubjectIcon } from "../../components/brand";
import { NavIconButton, Page } from "../../components/ios/Page";
import { fmtSum } from "../../lib/format";
import { distanceKm, formatDistance } from "../../lib/geo";
import { newId, useApp, useOrigin, useProfile } from "../../store/app";
import { useNav } from "../../store/nav";
import { inTelegram } from "../../lib/telegram";

const SUGGESTIONS = ["Ingliz tili, 300 minggacha", "Shanba kuni matematika", "Uyga yaqin IT kurslari", "Bo‘sh joyi bor sport to‘garagi"];

function CenterCard({ id }: { id: string }) {
  const c = useApp((s) => s.centers.find((x) => x.id === id));
  const push = useNav((s) => s.push);
  const { pos } = useOrigin();
  if (!c) return null;
  const free = c.groups.reduce((s, g) => s + g.freeSeats, 0);
  return (
    <button onClick={() => push({ name: "center", centerId: c.id })} className="focus-ring pressable mt-1.5 flex w-[88%] items-center gap-3 rounded-[16px] bg-card p-3 text-left shadow-card">
      <SubjectIcon name={c.groups[0]?.subject ?? "Boshqa"} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-headline">{c.name}</span>
        <span className="tnum block truncate text-footnote text-ink2">
          {formatDistance(distanceKm(pos, c))} · {fmtSum(Math.min(...c.groups.map((g) => g.price)))} dan
        </span>
      </span>
      <SeatChip count={free} />
    </button>
  );
}

export function AiChatPage() {
  const backend = useApp((s) => s.backend);
  const centers = useApp((s) => s.centers);
  const msgs = useProfile((s) => s.aiMessages);
  const add = useProfile((s) => s.addAiMsg);
  const clear = useProfile((s) => s.clearAi);
  const { pos } = useOrigin();
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState(false);
  const scrollRef = useStickToBottom(`${msgs.length}-${busy}`);

  const ask = async (text: string) => {
    if (!backend || busy) return;
    const history = msgs.slice(-8).map((m) => ({ from: m.from, text: m.text }));
    add({ id: newId(), from: "user", text, createdMs: Date.now() });
    setBusy(true);
    try {
      const r = await backend.askAI(text, history, { centers, pos });
      setFallback(!!r.fallback);
      add({ id: newId(), from: "ai", text: r.text, cards: r.cards, createdMs: Date.now() });
    } catch {
      add({ id: newId(), from: "ai", text: "Kechirasiz, hozir javob bera olmadim. Birozdan keyin qayta urinib ko‘ring.", createdMs: Date.now() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page
      title="AI yordamchi"
      back
      backLabel="Chat"
      tabbar={false}
      scrollRef={scrollRef}
      right={
        msgs.length > 0 && (
          <NavIconButton label="Suhbatni tozalash" onClick={clear}>
            <Trash2 size={21} />
          </NavIconButton>
        )
      }
      bottom={<Composer onSend={ask} busy={busy} placeholder="Masalan: shanba kuni ingliz tili" />}
    >
      <div className="px-3" style={{ paddingBottom: 56 }}>
        <div className="flex flex-col items-center px-6 pb-4 pt-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-tint text-white" aria-hidden>
            <Sparkles size={30} />
          </span>
          <h2 className="mt-3 text-headline">Mos markazni topib beraman</h2>
          <p className="mt-1 text-footnote text-ink2">Fan, narx, kun va masofani yozing. Bo‘sh joyi borlarini birinchi ko‘rsataman.</p>
          {(fallback || !backend?.aiEnabled) && <p className="mt-2 rounded-full bg-fill px-3 py-1 text-caption text-ink2">Oddiy qidiruv rejimi</p>}
          {backend && !backend.authed && backend.mode === "firebase" && (
            <p className="mt-3 rounded-card bg-gold-soft px-4 py-3 text-footnote text-gold-text">
              {inTelegram
                ? "To‘liq AI yordamchi uchun ilovani botdagi «Ochish» tugmasi (yozish maydoni yonida) yoki «🚀 YaqinDars’ni ochish» orqali oching."
                : "To‘liq AI yordamchi Telegram ichida ishlaydi: @yaqindars_bot → «Ochish»."}
            </p>
          )}
        </div>

        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const next = msgs[i + 1];
          return (
            <Fragment key={m.id}>
              {newDay(prev?.createdMs, m.createdMs) && i > 0 && <DaySeparator ms={m.createdMs} />}
              <Bubble mine={m.from === "user"} text={m.text} ms={m.createdMs} tail={!next || next.from !== m.from}>
                {m.cards?.map((id) => <CenterCard key={id} id={id} />)}
              </Bubble>
            </Fragment>
          );
        })}
        {busy && <TypingDots />}

        {!msgs.length && !busy && (
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="focus-ring pressable rounded-full bg-card px-3.5 py-2 text-subhead text-tint shadow-[0_0_0_0.5px_var(--sep)]">
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </Page>
  );
}
