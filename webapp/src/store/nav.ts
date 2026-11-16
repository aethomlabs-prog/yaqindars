import { create } from "zustand";
import { haptic } from "../lib/telegram";

export type Tab = "home" | "map" | "chat" | "profile";

export type Route =
  | { name: "center"; centerId: string }
  | { name: "search" }
  | { name: "conversation"; chatId: string }
  | { name: "ai" }
  | { name: "children" }
  | { name: "childEdit"; childId: string | null }
  | { name: "applications" }
  | { name: "favorites" }
  | { name: "addresses" }
  | { name: "watches" }
  | { name: "about" };

export interface StackEntry {
  key: number;
  route: Route;
}

interface NavStore {
  tab: Tab;
  stacks: Record<Tab, StackEntry[]>;
  /** pop animatsiyasi yo‘nalishi uchun */
  setTab: (t: Tab) => void;
  push: (r: Route, tab?: Tab) => void;
  pop: () => void;
}

let key = 0;

export const useNav = create<NavStore>((set, get) => ({
  tab: "home",
  stacks: { home: [], map: [], chat: [], profile: [] },
  setTab: (t) => {
    const { tab, stacks } = get();
    if (t === tab) {
      // iOS: faol tabni qayta bosish — ildizga qaytish
      if (stacks[t].length) set({ stacks: { ...stacks, [t]: [] } });
      return;
    }
    haptic.selection();
    set({ tab: t });
  },
  push: (r, tab) => {
    const s = get();
    const t = tab ?? s.tab;
    set({ tab: t, stacks: { ...s.stacks, [t]: [...s.stacks[t], { key: ++key, route: r }] } });
  },
  pop: () => {
    const { tab, stacks } = get();
    if (!stacks[tab].length) return;
    set({ stacks: { ...stacks, [tab]: stacks[tab].slice(0, -1) } });
  }
}));
