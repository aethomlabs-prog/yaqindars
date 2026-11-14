/* Markaz bilan suhbat (real vaqt). */
import { EmptyState, SkeletonList } from "../../components/motion";
import { Fragment, useEffect, useState } from "react";
import { Bubble, Composer, DaySeparator, newDay, SystemNote, TypingDots, useStickToBottom } from "../../components/chat";
import { Avatar } from "../../components/ios/controls";
import { Page } from "../../components/ios/Page";
import type { Message } from "../../lib/types";
import { useApp, useCenter } from "../../store/app";
import { useNav } from "../../store/nav";

export function ConversationPage({ chatId }: { chatId: string }) {
  const backend = useApp((s) => s.backend);
  const chat = useApp((s) => s.chats.find((c) => c.id === chatId));
  const typing = useApp((s) => !!s.typing[chatId]);
  const showToast = useApp((s) => s.showToast);
  const center = useCenter(chat?.centerId);
  const push = useNav((s) => s.push);
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const scrollRef = useStickToBottom(`${msgs?.length}-${typing}`);

  useEffect(() => {
    if (!backend) return;
    return backend.watchMessages(chatId, setMsgs);
  }, [backend, chatId]);

  // Ochiq turgan suhbatdagi yangi xabarlar — o‘qilgan
  useEffect(() => {
    if (chat?.unread) backend?.markRead(chatId);
  }, [backend, chatId, chat?.unread]);

  const title = chat?.title ?? center?.name ?? "Suhbat";

  const send = async (text: string) => {
    try {
      await backend!.sendMessage(chatId, text);
    } catch {
      showToast("Xabar yuborilmadi. Internetni tekshiring.", "error");
    }
  };

  return (
    <Page
      title={title}
      back
      backLabel="Chat"
      tabbar={false}
      scrollRef={scrollRef}
      right={
        center && (
          <button aria-label={`${title} sahifasi`} onClick={() => push({ name: "center", centerId: center.id })} className="focus-ring rounded-full pressable">
            <Avatar name={title} src={center.photoUrl} size={34} />
          </button>
        )
      }
      bottom={<Composer onSend={send} disabled={!backend?.centerChatEnabled} placeholder={backend?.centerChatEnabled ? "Xabar" : "Chat Telegram ichida ishlaydi"} />}
    >
      <div className="px-3" style={{ paddingBottom: 56 }}>
        {msgs === null ? (
          <SkeletonList count={3} />
        ) : msgs.length === 0 ? (
          <EmptyState kind="chats" title="Hali xabar yo‘q" text="Savolingizni yozing — markaz Telegram orqali javob beradi" />
        ) : (
          msgs.map((m, i) => {
            const prev = msgs[i - 1];
            const next = msgs[i + 1];
            return (
              <Fragment key={m.id}>
                {newDay(prev?.createdMs, m.createdMs) && <DaySeparator ms={m.createdMs} />}
                {m.from === "system" ? (
                  <SystemNote text={m.text} />
                ) : (
                  <Bubble mine={m.from === "user"} text={m.text} ms={m.createdMs} tail={!next || next.from !== m.from || newDay(m.createdMs, next.createdMs)} />
                )}
              </Fragment>
            );
          })
        )}
        {typing && <TypingDots />}
      </div>
    </Page>
  );
}
