import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { pushTransition } from "../components/ios/motion";
import { Spinner } from "../components/ios/Spinner";
import { TabBar } from "../components/ios/TabBar";
import { Toast } from "../components/ios/Toast";
import { applyChromeColors, onThemeChanged, startParam, telegramColorScheme, useBackHandler } from "../lib/telegram";
import { useApp, useSettings } from "../store/app";
import { useNav, type Route, type Tab } from "../store/nav";
import { HomeScreen } from "../screens/home/HomeScreen";
import { SearchPage } from "../screens/home/SearchPage";
import { CenterPage } from "../screens/center/CenterPage";
import { ChatListScreen } from "../screens/chat/ChatListScreen";
import { ConversationPage } from "../screens/chat/ConversationPage";
import { AiChatPage } from "../screens/chat/AiChatPage";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { ChildrenPage, ChildEditPage } from "../screens/profile/ChildrenPages";
import { ApplicationsPage } from "../screens/profile/ApplicationsPage";
import { FavoritesPage } from "../screens/profile/FavoritesPage";
import { AddressesPage } from "../screens/profile/AddressesPage";
import { AboutPage } from "../screens/profile/AboutPage";

// Xarita (Leaflet) — alohida chunk, faqat Xarita tabida yuklanadi
const MapScreen = lazy(() => import("../screens/map/MapScreen"));

function renderRoute(r: Route): ReactNode {
  switch (r.name) {
    case "center":
      return <CenterPage centerId={r.centerId} />;
    case "search":
      return <SearchPage />;
    case "conversation":
      return <ConversationPage chatId={r.chatId} />;
    case "ai":
      return <AiChatPage />;
    case "children":
      return <ChildrenPage />;
    case "childEdit":
      return <ChildEditPage childId={r.childId} />;
    case "applications":
      return <ApplicationsPage />;
    case "favorites":
      return <FavoritesPage />;
    case "addresses":
      return <AddressesPage />;
    case "about":
      return <AboutPage />;
  }
}

function Loading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-ink2">
      <Spinner size={28} />
    </div>
  );
}

function TabRoot({ tab }: { tab: Tab }) {
  switch (tab) {
    case "home":
      return <HomeScreen />;
    case "map":
      return (
        <Suspense fallback={<Loading />}>
          <MapScreen />
        </Suspense>
      );
    case "chat":
      return <ChatListScreen />;
    case "profile":
      return <ProfileScreen />;
  }
}

function useTheme() {
  const pref = useSettings((s) => s.theme);
  const [tgScheme, setTgScheme] = useState(telegramColorScheme());
  const [sysDark, setSysDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => onThemeChanged(() => setTgScheme(telegramColorScheme())), []);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => setSysDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const dark = pref === "dark" || (pref === "auto" && (tgScheme ? tgScheme === "dark" : sysDark));
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const bg = dark ? "#000000" : "#F2F2F7";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
    applyChromeColors(bg, dark ? "#161618" : "#F9F9F9");
  }, [dark]);
}

export function App() {
  useTheme();
  const tab = useNav((s) => s.tab);
  const stacks = useNav((s) => s.stacks);
  const pop = useNav((s) => s.pop);
  const push = useNav((s) => s.push);
  const boot = useApp((s) => s.boot);
  const bootError = useApp((s) => s.bootError);
  const centersReady = useApp((s) => s.centersStatus === "ready");
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(["home"]));

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    setVisited((v) => (v.has(tab) ? v : new Set(v).add(tab)));
  }, [tab]);

  // Deep link: t.me/BOT?startapp=c_<markazId>
  useEffect(() => {
    if (centersReady && startParam?.startsWith("c_")) push({ name: "center", centerId: startParam.slice(2) }, "home");
  }, [centersReady, push]);

  const stack = stacks[tab];
  useBackHandler(stack.length > 0, pop);

  if (bootError)
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <p className="text-headline">{bootError}</p>
        <button className="mt-4 text-body text-tint" onClick={() => location.reload()}>
          Qayta urinish
        </button>
      </div>
    );

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative h-full overflow-hidden" style={{ height: "var(--vh)" }}>
        {(["home", "map", "chat", "profile"] as Tab[]).map((t) =>
          visited.has(t) ? (
            <div key={t} className="absolute inset-0" style={{ visibility: t === tab ? "visible" : "hidden" }} aria-hidden={t !== tab}>
              <motion.div
                className="absolute inset-0"
                animate={{ x: t === tab && stacks[t].length ? "-28%" : 0, opacity: t === tab && stacks[t].length ? 0.9 : 1 }}
                transition={pushTransition}
              >
                <TabRoot tab={t} />
              </motion.div>
              <AnimatePresence initial={false}>
                {stacks[t].map((e, i) => (
                  <motion.div
                    key={e.key}
                    className="absolute inset-0 bg-bg"
                    style={{ zIndex: 10 + i, boxShadow: "-1px 0 0 var(--line)" }}
                    initial={{ x: "100%" }}
                    animate={{ x: i === stacks[t].length - 1 ? 0 : "-28%" }}
                    exit={{ x: "100%" }}
                    transition={pushTransition}
                  >
                    {renderRoute(e.route)}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : null
        )}
        <TabBar />
        <Toast />
      </div>
    </MotionConfig>
  );
}
