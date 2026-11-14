/* Pastki tab bar: shaffof blur, jonli ikonkalar (motion/TabIcon); o‘z pastki paneli bor sahifalarda yashirinadi. */
import { TabIcon } from "../motion";
import { useApp } from "../../store/app";
import { useNav, type Tab } from "../../store/nav";

const LABELS: Record<Tab, string> = { home: "Asosiy", map: "Xarita", chat: "Chat", profile: "Profil" };
const TABS: Tab[] = ["home", "map", "chat", "profile"];
const HIDE_ON = ["center", "conversation", "ai"];

export function TabBar() {
  const tab = useNav((s) => s.tab);
  const setTab = useNav((s) => s.setTab);
  const unread = useApp((s) => s.chats.reduce((n, c) => n + c.unread, 0));
  // iOS: o‘z pastki paneli bor sahifalarda (chat, markaz) tab bar yashirinadi
  const hidden = useNav((s) => {
    const top = s.stacks[s.tab][s.stacks[s.tab].length - 1];
    return !!top && HIDE_ON.includes(top.route.name);
  });

  return (
    <nav
      className="blur-bar hairline-t fixed inset-x-0 bottom-0 z-40 flex"
      style={{
        height: "var(--tabbar-h)",
        paddingBottom: "var(--safe-bottom)",
        pointerEvents: hidden ? "none" : undefined,
        transform: hidden ? "translateY(100%)" : "none",
        transition: "transform .3s cubic-bezier(.32,.72,0,1)"
      }}
      aria-label="Bo‘limlar"
      aria-hidden={hidden}
    >
      {TABS.map((t) => {
        const active = t === tab;
        return (
          <button
            key={t}
            onClick={() => setTab(t)}
            tabIndex={hidden ? -1 : undefined}
            aria-current={active ? "page" : undefined}
            className={`focus-ring relative flex flex-1 flex-col items-center justify-center gap-0.5 ${active ? "text-tint" : "text-ink3"}`}
          >
            <span className="relative">
              <TabIcon id={t} active={active} />
              {t === "chat" && unread > 0 && (
                <span className="tnum absolute -right-2 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[11px] font-semibold text-white">
                  {unread}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium leading-3">{LABELS[t]}</span>
          </button>
        );
      })}
    </nav>
  );
}
