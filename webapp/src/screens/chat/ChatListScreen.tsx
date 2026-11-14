/* Chat tabi: tepada AI yordamchi, pastda markazlar bilan suhbatlar. */
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, MinusCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { Avatar, CountBadge, EmptyState } from "../../components/ios/controls";
import { listItem } from "../../components/ios/motion";
import { Page } from "../../components/ios/Page";
import { fmtListTime } from "../../lib/format";
import { haptic } from "../../lib/telegram";
import { useApp, useProfile } from "../../store/app";
import { useNav } from "../../store/nav";

export function ChatListScreen() {
  const chats = useApp((s) => s.chats);
  const typing = useApp((s) => s.typing);
  const backend = useApp((s) => s.backend);
  const showToast = useApp((s) => s.showToast);
  const centers = useApp((s) => s.centers);
  const aiLast = useProfile((s) => s.aiMessages[s.aiMessages.length - 1]);
  const push = useNav((s) => s.push);
  const setTab = useNav((s) => s.setTab);
  const [editing, setEditing] = useState(false);

  const remove = async (id: string) => {
    haptic.light();
    try {
      await backend?.deleteChat(id);
    } catch {
      showToast("O‘chirib bo‘lmadi", "error");
    }
  };

  return (
    <Page
      title="Chat"
      large
      right={
        chats.length > 0 && (
          <button onClick={() => setEditing((e) => !e)} className="focus-ring h-11 px-2 text-body text-tint">
            {editing ? "Tayyor" : "Tahrirlash"}
          </button>
        )
      }
    >
      <div className="mx-4 mt-2 overflow-hidden rounded-card bg-card">
        <button onClick={() => push({ name: "ai" })} className="focus-ring flex w-full items-center gap-3 px-4 text-left active:bg-fill">
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-tint text-white" aria-hidden>
            <Sparkles size={24} />
          </span>
          <span className="min-w-0 flex-1 py-3">
            <span className="flex items-center justify-between gap-2">
              <span className="text-headline">AI yordamchi</span>
              {aiLast && <span className="text-footnote text-ink3">{fmtListTime(aiLast.createdMs)}</span>}
            </span>
            <span className="mt-0.5 line-clamp-2 text-subhead text-ink2">{aiLast?.text ?? "Farzandingizga mos markazni so‘rang — narx, kun va masofani hisobga oladi."}</span>
          </span>
        </button>
      </div>

      {chats.length > 0 ? (
        <>
          <h2 className="mb-1.5 mt-6 px-8 text-[13px] uppercase tracking-[0.02em] text-ink2">Markazlar bilan</h2>
          <div className="mx-4 overflow-hidden rounded-card bg-card">
            <AnimatePresence initial={false}>
              {chats.map((c, i) => {
                const center = centers.find((x) => x.id === c.centerId);
                return (
                  <motion.div key={c.id} {...listItem(i)} exit={{ opacity: 0, height: 0 }} className="group flex items-center">
                    <AnimatePresence>
                      {editing && (
                        <motion.button
                          initial={{ width: 0, opacity: 0 }}
                          animate={{ width: 44, opacity: 1 }}
                          exit={{ width: 0, opacity: 0 }}
                          onClick={() => remove(c.id)}
                          aria-label={`${c.title} suhbatini o‘chirish`}
                          className="flex h-11 shrink-0 items-center justify-end overflow-hidden text-[#FF3B30]"
                        >
                          <MinusCircle size={22} fill="#FF3B30" color="white" />
                        </motion.button>
                      )}
                    </AnimatePresence>
                    <button
                      disabled={editing}
                      onClick={() => push({ name: "conversation", chatId: c.id })}
                      className="focus-ring flex min-w-0 flex-1 items-center gap-3 px-4 text-left active:bg-fill"
                    >
                      <Avatar name={c.title} src={center?.photoUrl} size={52} />
                      <span className="min-w-0 flex-1 py-3 [box-shadow:inset_0_-0.5px_0_var(--sep)] group-last:shadow-none">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-headline">{c.title}</span>
                          <span className={`tnum shrink-0 text-footnote ${c.unread ? "text-tint" : "text-ink3"}`}>{fmtListTime(c.lastMs)}</span>
                        </span>
                        <span className="mt-0.5 flex items-start justify-between gap-2">
                          <span className={`line-clamp-2 text-subhead ${typing[c.id] ? "text-tint" : "text-ink2"}`}>{typing[c.id] ? "yozmoqda…" : c.lastMessage || "Suhbat boshlandi"}</span>
                          <CountBadge n={c.unread} />
                        </span>
                      </span>
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      ) : (
        <EmptyState
          icon={<MessageCircle size={26} />}
          text={
            backend?.centerChatEnabled
              ? "Markaz sahifasidagi «Yozish» tugmasi orqali savol bering — javoblar shu yerda chiqadi."
              : "Markazlar bilan yozishish Telegram ichida ochilganda ishlaydi."
          }
          action="Markazlarni ko‘rish"
          onAction={() => setTab("home")}
        />
      )}
    </Page>
  );
}
