import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { TabBar } from "../components/ios/TabBar";
import { IslandBridge } from "../components/IslandBridge";
import { IslandProvider, Onboarding, shouldShowOnboarding, SkeletonList, Splash } from "../components/motion";
import { INSTALL_LANDING, InstallPrompt } from "../components/InstallPrompt";
import { OfflineBanner } from "../components/OfflineBanner";
import { DEBUG, DebugPanel } from "../components/DebugPanel";
import { NetworkModal } from "../components/NetworkModal";
import { applyChromeColors, onThemeChanged, startParam, telegramColorScheme, useBackHandler } from "../lib/telegram";
import { useApp, useProfile, useSettings } from "../store/app";
import { useNav, type Route, type StackEntry, type Tab } from "../store/nav";
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
// Markazlar uchun ro‘yxatdan o‘tish (bot: /markaz → ?mode=register)
const RegisterApp = lazy(() => import("../register/RegisterApp"));
const OwnerApp = lazy(() => import("../owner/OwnerApp"));
const InstallLanding = lazy(() => import("../components/InstallLanding"));
const AdminApp = lazy(() => import("../admin/AdminApp"));
const MODE = new URLSearchParams(location.search).get("mode"); // register | owner | null

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
    <div className="absolute inset-0 bg-bg" style={{ paddingTop: "calc(56px + var(--safe-top))" }}>
      <SkeletonList count={4} />
    </div>
  );
}

/** Splash kamida 600 ms (aks holda chaqnab ketadi) va ma’lumot tayyor bo‘lguncha */
function useSplashReady(ready: boolean) {
  const [minDone, setMinDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 600);
    return () => clearTimeout(t);
  }, []);
  return ready && minDone;
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
  // index.html dagi ko‘k «boot» qatlami: React (va animatsiyali Splash) chizilishi bilan olib tashlanadi
  useLayoutEffect(() => {
    document.getElementById("boot")?.remove();
  }, []);
  return (
    <IslandProvider>
      {INSTALL_LANDING ? (
        <Suspense fallback={<Loading />}>
          <InstallLanding />
        </Suspense>
      ) : MODE === "register" ? (
        <RegisterRoot />
      ) : MODE === "owner" ? (
        <OwnerRoot />
      ) : MODE === "admin" ? (
        <AdminRoot />
      ) : (
        <MainApp />
      )}
      <IslandBridge />
      <NetworkModal />
      {DEBUG && <DebugPanel />}
    </IslandProvider>
  );
}

/** Admin dashboard (bot: /admin) */
function AdminRoot() {
  useTheme();
  const boot = useApp((s) => s.boot);
  useEffect(() => {
    boot();
  }, [boot]);
  return (
    <Suspense fallback={<Loading />}>
      <AdminApp />
    </Suspense>
  );
}

/** Ta’lim beruvchi kabineti (bot: «🎓 Ta’lim beruvchi bo‘lib kirish») */
function OwnerRoot() {
  useTheme();
  const boot = useApp((s) => s.boot);
  const authDone = useApp((s) => !!s.backend || !!s.bootError || s.centersStatus === "ready");
  const splashReady = useSplashReady(authDone);
  useEffect(() => {
    boot();
  }, [boot]);
  return (
    <>
      <Suspense fallback={<Loading />}>
        <OwnerApp />
      </Suspense>
      <Splash ready={splashReady} />
    </>
  );
}

function RegisterRoot() {
  useTheme();
  return (
    <Suspense fallback={<Loading />}>
      <RegisterApp />
    </Suspense>
  );
}

const PUSH_EASE = "cubic-bezier(.32,.72,0,1)";

/** Bitta tab: ildiz ekran + ichki sahifalar steki. Yopilayotgan sahifa 320 ms chiqish animatsiyasi bilan qoladi. */
function TabStack({ t, active }: { t: Tab; active: boolean }) {
  const stack = useNav((s) => s.stacks[t]);
  const [leaving, setLeaving] = useState<StackEntry | null>(null);
  const prev = useRef(stack);

  // bo'yalishdan OLDIN ushlaymiz — aks holda bir kadr bo'sh qoladi
  useLayoutEffect(() => {
    const p = prev.current;
    prev.current = stack;
    const gone = p[p.length - 1];
    if (stack.length < p.length && gone && !stack.some((e) => e.key === gone.key)) {
      setLeaving(gone);
      const tm = setTimeout(() => setLeaving(null), 320);
      return () => clearTimeout(tm);
    }
  }, [stack]);

  const items = leaving ? [...stack, leaving] : stack;
  return (
    <div className="absolute inset-0" style={{ visibility: active ? "visible" : "hidden" }} aria-hidden={!active}>
      <div
        className="absolute inset-0"
        style={{ transform: stack.length ? "translateX(-28%)" : "none", opacity: stack.length ? 0.9 : 1, transition: `transform .35s ${PUSH_EASE}, opacity .35s` }}
      >
        <TabRoot tab={t} />
      </div>
      {items.map((e, i) => {
        const out = e === leaving;
        const under = !out && i < stack.length - 1;
        return (
          <div
            key={e.key}
            className={`absolute inset-0 bg-bg ${out ? "app-page-out" : "app-page-in"}`}
            style={{ zIndex: 10 + i, boxShadow: "-1px 0 0 var(--line)", transform: under ? "translateX(-28%)" : undefined, transition: `transform .35s ${PUSH_EASE}` }}
          >
            {renderRoute(e.route)}
          </div>
        );
      })}
    </div>
  );
}

/** Saqlangan markazda joy bo'shasa (0 -> bor) — Island */
function useSeatAlerts() {
  const centers = useApp((s) => s.centers);
  const favorites = useProfile((s) => s.favorites);
  const notify = useApp((s) => s.notify);
  const push = useNav((s) => s.push);
  const prev = useRef(new Map<string, number[]>());
  useEffect(() => {
    for (const c of centers) {
      const now = c.groups.map((g) => g.freeSeats);
      const was = prev.current.get(c.id);
      prev.current.set(c.id, now);
      if (!was || !favorites.includes(c.id)) continue;
      const gi = now.findIndex((n, i) => n > 0 && (was[i] ?? 0) <= 0);
      if (gi >= 0) {
        const g = c.groups[gi];
        notify({ title: "Joy bo‘shadi!", text: `${c.name.replace(/^Namuna:\s*/, "")} · ${g.subject} · ${g.time.split("–")[0]}`, onTap: () => push({ name: "center", centerId: c.id }) });
        break;
      }
    }
  }, [centers, favorites, notify, push]);
}

function MainApp() {
  useTheme();
  const tab = useNav((s) => s.tab);
  const stacks = useNav((s) => s.stacks);
  const pop = useNav((s) => s.pop);
  const push = useNav((s) => s.push);
  const boot = useApp((s) => s.boot);
  const bootError = useApp((s) => s.bootError);
  const centersReady = useApp((s) => s.centersStatus === "ready");
  const authDone = useApp((s) => !!s.backend || !!s.bootError || s.centersStatus === "ready");
  const splashReady = useSplashReady(authDone);
  const [onboarding, setOnboarding] = useState(shouldShowOnboarding);
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(["home"]));
  useSeatAlerts();

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
    <>
      <div className="relative h-full overflow-hidden" style={{ height: "var(--vh)" }}>
        {(["home", "map", "chat", "profile"] as Tab[]).map((t) => (visited.has(t) ? <TabStack key={t} t={t} active={t === tab} /> : null))}
        <TabBar />
        {!onboarding && <InstallPrompt />}
        <OfflineBanner />
      </div>
      {splashReady && onboarding && <Onboarding onDone={() => setOnboarding(false)} />}
      <Splash ready={splashReady} />
    </>
  );
}
