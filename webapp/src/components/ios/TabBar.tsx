/* Pastki tab bar: shaffof blur, faol tab — tint rangda va to‘ldirilgan ikonka, bosilganda «spring». */
import { motion } from "framer-motion";
import { useApp } from "../../store/app";
import { useNav, type Tab } from "../../store/nav";
import { spring } from "./motion";

const ICONS: Record<Tab, { outline: string; filled: string }> = {
  home: {
    outline: "M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z",
    filled: "M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z"
  },
  map: {
    outline: "M9 4.5 3.5 6.6v13l5.5-2.1 6 2.1 5.5-2.1v-13L15 6.6zM9 4.5v13M15 6.6v13",
    filled: "M9 4.5 3.5 6.6v13l5.5-2.1 6 2.1 5.5-2.1v-13L15 6.6z"
  },
  chat: {
    outline: "M12 4c4.7 0 8.5 3.2 8.5 7.2s-3.8 7.2-8.5 7.2c-.9 0-1.8-.1-2.6-.3L5 20l1-3.6c-1.6-1.3-2.5-3.1-2.5-5.2C3.5 7.2 7.3 4 12 4z",
    filled: "M12 4c4.7 0 8.5 3.2 8.5 7.2s-3.8 7.2-8.5 7.2c-.9 0-1.8-.1-2.6-.3L5 20l1-3.6c-1.6-1.3-2.5-3.1-2.5-5.2C3.5 7.2 7.3 4 12 4z"
  },
  profile: {
    outline: "M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.6-3.6 3.7-5.8 7.5-5.8s6.9 2.2 7.5 5.8",
    filled: "M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c.6-3.6 3.7-5.8 7.5-5.8s6.9 2.2 7.5 5.8z"
  }
};

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
    <motion.nav
      className="blur-bar hairline-t fixed inset-x-0 bottom-0 z-40 flex"
      style={{ height: "var(--tabbar-h)", paddingBottom: "var(--safe-bottom)", pointerEvents: hidden ? "none" : undefined }}
      animate={{ y: hidden ? "100%" : 0 }}
      transition={{ type: "tween", duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
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
            <motion.span key={active ? `${t}-on` : t} initial={active ? { scale: 0.9 } : false} animate={{ scale: 1 }} transition={spring} className="relative">
              <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden>
                <path
                  d={active ? ICONS[t].filled : ICONS[t].outline}
                  fill={active ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth={active ? 1.2 : 1.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {active && t === "map" && <path d="M9 4.5v13M15 6.6v13" stroke="var(--card)" strokeWidth="1.4" />}
              </svg>
              {t === "chat" && unread > 0 && (
                <span className="tnum absolute -right-2 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF3B30] px-1 text-[11px] font-semibold text-white">
                  {unread}
                </span>
              )}
            </motion.span>
            <span className="text-[11px] font-medium leading-3">{LABELS[t]}</span>
          </button>
        );
      })}
    </motion.nav>
  );
}
