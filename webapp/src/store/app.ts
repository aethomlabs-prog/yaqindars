import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { FIREBASE_CONFIG, FORCE_DEMO } from "../../config";
import type { Backend, ProfileDoc } from "../lib/backend";
import { getCurrentPosition, RISHTON, watchPosition } from "../lib/geo";
import { haptic, tgUser } from "../lib/telegram";
import type { Address, Application, Center, Chat, Child, LatLng, Message } from "../lib/types";

export const IS_DEMO = !FIREBASE_CONFIG || FORCE_DEMO;

/* ---------- Xavfsiz localStorage ---------- */
const safeStorage = createJSONStorage(() => {
  try {
    const k = "__yd";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
});

/* ---------- Sozlamalar (index.html ham o‘qiydi: "yd-settings") ---------- */
export type ThemePref = "auto" | "light" | "dark";
interface Settings {
  theme: ThemePref;
  lang: "uz" | "ru";
  setTheme: (t: ThemePref) => void;
  setLang: (l: "uz" | "ru") => void;
}
export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: "auto",
      lang: "uz",
      setTheme: (theme) => {
        set({ theme });
        syncProfile({ theme });
      },
      setLang: (lang) => {
        set({ lang });
        syncProfile({ lang });
      }
    }),
    { name: "yd-settings", storage: safeStorage, partialize: (s) => ({ theme: s.theme, lang: s.lang }) }
  )
);

/* ---------- Profil (lokal + auth bo‘lsa Firestore bilan sinxron) ---------- */
export interface AiMsg {
  id: string;
  from: "user" | "ai";
  text: string;
  cards?: string[];
  createdMs: number;
}
interface Profile {
  children: Child[];
  favorites: string[];
  addresses: Address[];
  activeAddressId: string | null;
  notify: { seats: boolean; reminders: boolean };
  localApps: Application[];
  recentSearches: string[];
  aiMessages: AiMsg[];
  saveChild: (c: Child) => void;
  removeChild: (id: string) => void;
  toggleFavorite: (id: string) => boolean;
  saveAddress: (a: Address) => void;
  removeAddress: (id: string) => void;
  setActiveAddress: (id: string | null) => void;
  setNotify: (patch: Partial<Profile["notify"]>) => void;
  addRecent: (q: string) => void;
  clearRecent: () => void;
  addAiMsg: (m: AiMsg) => void;
  clearAi: () => void;
}

export const useProfile = create<Profile>()(
  persist(
    (set, get) => ({
      children: [],
      favorites: [],
      addresses: [],
      activeAddressId: null,
      notify: { seats: true, reminders: true },
      localApps: [],
      recentSearches: [],
      aiMessages: [],
      saveChild: (c) => {
        const list = get().children.some((x) => x.id === c.id) ? get().children.map((x) => (x.id === c.id ? c : x)) : [...get().children, c];
        set({ children: list });
        syncProfile({ children: list });
      },
      removeChild: (id) => {
        const list = get().children.filter((x) => x.id !== id);
        set({ children: list });
        syncProfile({ children: list });
      },
      toggleFavorite: (id) => {
        const has = get().favorites.includes(id);
        const list = has ? get().favorites.filter((x) => x !== id) : [id, ...get().favorites];
        set({ favorites: list });
        syncProfile({ favorites: list });
        haptic.light();
        return !has;
      },
      saveAddress: (a) => {
        const list = get().addresses.some((x) => x.id === a.id) ? get().addresses.map((x) => (x.id === a.id ? a : x)) : [...get().addresses, a];
        set({ addresses: list });
        syncProfile({ addresses: list });
      },
      removeAddress: (id) => {
        const list = get().addresses.filter((x) => x.id !== id);
        set({ addresses: list, activeAddressId: get().activeAddressId === id ? null : get().activeAddressId });
        syncProfile({ addresses: list });
      },
      setActiveAddress: (id) => set({ activeAddressId: id }),
      setNotify: (patch) => {
        const notify = { ...get().notify, ...patch };
        set({ notify });
        syncProfile({ notify });
      },
      addRecent: (q) => set({ recentSearches: [q, ...get().recentSearches.filter((x) => x !== q)].slice(0, 6) }),
      clearRecent: () => set({ recentSearches: [] }),
      addAiMsg: (m) => set({ aiMessages: [...get().aiMessages, m].slice(-60) }),
      clearAi: () => set({ aiMessages: [] })
    }),
    {
      name: IS_DEMO ? "yd-profile-demo" : "yd-profile",
      storage: safeStorage,
      partialize: (s) => ({
        children: s.children,
        favorites: s.favorites,
        addresses: s.addresses,
        activeAddressId: s.activeAddressId,
        notify: s.notify,
        localApps: s.localApps,
        recentSearches: s.recentSearches,
        aiMessages: s.aiMessages
      })
    }
  )
);

function syncProfile(patch: Partial<ProfileDoc>) {
  const b = useApp.getState().backend;
  if (b?.authed && b.mode === "firebase") b.saveProfile(patch).catch((e) => console.warn("saveProfile:", e));
}

/* ---------- Ilova holati ---------- */
export interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error" | "info";
}

interface AppState {
  backend: Backend | null;
  bootError: string | null;
  centers: Center[];
  centersStatus: "idle" | "loading" | "ready" | "error";
  userPos: LatLng | null;
  /** joylashuv aniqligi, metr */
  userAcc: number | null;
  locating: boolean;
  chats: Chat[];
  apps: Application[];
  typing: Record<string, boolean>;
  aiEnabled: boolean;
  toast: Toast | null;
  boot: () => Promise<void>;
  loadCenters: () => Promise<void>;
  locate: (explicit?: boolean) => Promise<LatLng | null>;
  /** Xarita ochiq paytida joylashuvni jonli kuzatish; to‘xtatish funksiyasini qaytaradi */
  watchLocation: () => () => void;
  showToast: (text: string, kind?: Toast["kind"]) => void;
  setAiEnabled: (v: boolean) => void;
}

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useApp = create<AppState>((set, get) => ({
  backend: null,
  bootError: null,
  centers: [],
  centersStatus: "idle",
  userPos: null,
  userAcc: null,
  locating: false,
  chats: [],
  apps: [],
  typing: {},
  aiEnabled: false,
  toast: null,

  boot: async () => {
    let backend: Backend;
    try {
      if (IS_DEMO) {
        const { createDemoBackend } = await import("../demo/demoBackend");
        backend = createDemoBackend();
      } else {
        const { createFirebaseBackend } = await import("../lib/firebaseBackend");
        backend = await createFirebaseBackend();
      }
    } catch (e) {
      console.error(e);
      set({ bootError: "Serverga ulanib bo‘lmadi. Internetni tekshiring." });
      return;
    }
    set({ backend, aiEnabled: backend.aiEnabled });
    get().loadCenters();

    backend.watchChats((chats) => set({ chats }));
    backend.watchApplications((apps) => set({ apps }));
    backend.onTyping?.((chatId, typing) => set({ typing: { ...get().typing, [chatId]: typing } }));

    if (backend.authed && backend.mode === "firebase") {
      const p = await backend.loadProfile().catch(() => null);
      if (p) {
        const { theme, lang, ...rest } = p;
        useProfile.setState(rest);
        if (theme) useSettings.setState({ theme });
        if (lang) useSettings.setState({ lang });
      }
    }
  },

  loadCenters: async () => {
    const b = get().backend;
    if (!b) return;
    set({ centersStatus: "loading" });
    try {
      const centers = await b.loadCenters();
      set({ centers, centersStatus: "ready" });
    } catch (e) {
      console.error(e);
      set({ centersStatus: "error" });
    }
  },

  locate: async (explicit = false) => {
    set({ locating: true });
    try {
      const f = await getCurrentPosition();
      const p = { lat: f.lat, lng: f.lng };
      set({ userPos: p, userAcc: f.acc, locating: false });
      if (explicit) useProfile.getState().setActiveAddress(null);
      return p;
    } catch {
      set({ locating: false });
      if (explicit) get().showToast("Joylashuvni aniqlab bo‘lmadi. Telefon sozlamalarida ruxsat bering.", "error");
      return null;
    }
  },

  watchLocation: () =>
    watchPosition((f) => {
      const prev = get().userPos;
      // 3 m dan kam siljish — qayta chizmaymiz
      if (prev && Math.abs(prev.lat - f.lat) < 3e-5 && Math.abs(prev.lng - f.lng) < 3e-5 && get().userAcc === f.acc) return;
      set({ userPos: { lat: f.lat, lng: f.lng }, userAcc: f.acc });
    }),

  showToast: (text, kind = "info") => {
    clearTimeout(toastTimer);
    set({ toast: { id: ++toastSeq, text, kind } });
    toastTimer = setTimeout(() => set({ toast: null }), 3200);
  },
  setAiEnabled: (v) => set({ aiEnabled: v })
}));

/** Masofa hisoblanadigan nuqta: tanlangan manzil → GPS → Rishton markazi. */
export function useOrigin(): { pos: LatLng; label: string; source: "address" | "gps" | "default" } {
  const userPos = useApp((s) => s.userPos);
  const addresses = useProfile((s) => s.addresses);
  const activeId = useProfile((s) => s.activeAddressId);
  const addr = addresses.find((a) => a.id === activeId);
  if (addr) return { pos: addr, label: addr.label, source: "address" };
  if (userPos) return { pos: userPos, label: "Joriy joylashuv", source: "gps" };
  return { pos: RISHTON, label: "Rishton markazi", source: "default" };
}

export const displayName = () => tgUser?.first_name || (IS_DEMO ? "Mehmon" : "Mehmon");

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function useCenter(id: string | null | undefined): Center | undefined {
  return useApp((s) => s.centers.find((c) => c.id === id));
}

/** Arizalar: auth bo‘lsa — bazadan (holati yangilanadi), aks holda qurilmada saqlanganlari. */
export function useApplications(): Application[] {
  const authed = useApp((s) => !!s.backend?.authed);
  const remote = useApp((s) => s.apps);
  const local = useProfile((s) => s.localApps);
  return authed ? remote : local;
}

export async function submitApplication(input: Parameters<Backend["submitApplication"]>[0]): Promise<Application> {
  const b = useApp.getState().backend;
  if (!b) throw new Error("not ready");
  const app = await b.submitApplication(input);
  if (!b.authed) useProfile.setState((s) => ({ localApps: [app, ...s.localApps].slice(0, 30) }));
  return app;
}

export type { Message };
