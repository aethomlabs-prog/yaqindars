/* DEMO backend: hammasi qurilmada (localStorage), markaz javoblari va ariza holatlari simulyatsiya qilinadi. */
import type { ApplyInput, Backend, OwnerCenter, ProfileDoc } from "../lib/backend";
import { centerChatId } from "../lib/backend";
import { nextLessonMs } from "../lib/format";
import { RISHTON } from "../lib/geo";
import { ruleBasedReply } from "../lib/match";
import type { Application, AppStatus, Center, Chat, Message } from "../lib/types";
import { DEMO_CENTERS, DEMO_CENTER_REPLIES, DEMO_CHATS, DEMO_MESSAGES, DEMO_REVIEWS } from "./data";

const KEY = "yd-demo-v2";

interface DemoState {
  apps: Application[];
  chats: Chat[];
  messages: Record<string, Message[]>;
}

function load(): DemoState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && Array.isArray(s.chats)) return s;
  } catch {
    /* bo‘sh */
  }
  return { apps: [], chats: structuredClone(DEMO_CHATS), messages: structuredClone(DEMO_MESSAGES) };
}

export function createDemoBackend(): Backend {
  const state = load();
  const listeners = new Set<() => void>();
  const typingListeners = new Set<(id: string, t: boolean) => void>();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* private rejim */
    }
    listeners.forEach((l) => l());
  };
  const sub = (fn: () => void) => {
    listeners.add(fn);
    fn();
    return () => listeners.delete(fn);
  };
  const uid = () => Math.random().toString(36).slice(2, 10);

  function pushMsg(chatId: string, m: Omit<Message, "id" | "createdMs">, unread = 0) {
    const msg: Message = { ...m, id: uid(), createdMs: Date.now() };
    (state.messages[chatId] ||= []).push(msg);
    const chat = state.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.lastMessage = m.text;
      chat.lastMs = msg.createdMs;
      chat.unread += unread;
    }
    save();
  }

  function ensureChat(center: Center) {
    const id = centerChatId("demo", center.id);
    if (!state.chats.find((c) => c.id === id)) {
      state.chats.unshift({ id, type: "center", centerId: center.id, title: center.name, lastMessage: "", lastMs: Date.now(), unread: 0 });
      state.messages[id] ||= [];
    }
    return id;
  }

  const STATUS_TEXT: Record<AppStatus, string> = {
    new: "Ariza yuborildi",
    seen: "Ariza ko‘rildi",
    accepted: "Ariza qabul qilindi",
    rejected: "Ariza rad etildi"
  };

  function setStatus(appId: string, status: AppStatus) {
    const a = state.apps.find((x) => x.id === appId);
    if (!a) return;
    a.status = status;
    const center = DEMO_CENTERS.find((c) => c.id === a.centerId);
    if (status === "accepted" && center) {
      const g = center.groups[a.groupIndex];
      a.trialMs = g ? nextLessonMs(g.days, g.time) : null;
    }
    if (center) pushMsg(ensureChat(center), { from: "system", text: STATUS_TEXT[status] }, status === "new" ? 0 : 1);
    else save();
  }

  // DEMO kabinet: «Bilimdon» va «Ziyo Academy» — sizniki
  const mine: OwnerCenter[] = DEMO_CENTERS.filter((c) => c.id === "demo1" || c.id === "demo11").map((c) => ({
    ...structuredClone(c),
    approved: true,
    tariff: c.vip ? "vip" : "oddiy"
  }));
  const H = 3600000;
  const ownerApps: Application[] = [
    { id: "oa1", centerId: "demo1", centerName: mine[0].name, group: "Ingliz tili · Du, Ch, Ju · 16:00–17:30", groupIndex: 0, name: "Nodira Karimova", phone: "+998901112233", childId: null, comment: "O‘g‘lim 9 yoshda, boshlang‘ich daraja", status: "new", createdMs: Date.now() - 0.5 * H, trialMs: null },
    { id: "oa2", centerId: "demo1", centerName: mine[0].name, group: "Matematika · Se, Pa, Sh · 15:00–16:30", groupIndex: 1, name: "Sardor Aliyev", phone: "+998935554411", childId: null, comment: "", status: "seen", createdMs: Date.now() - 5 * H, trialMs: null },
    { id: "oa3", centerId: "demo1", centerName: mine[0].name, group: "Ingliz tili · Du, Ch, Ju · 16:00–17:30", groupIndex: 0, name: "Gulbahor Tursunova", phone: "+998977778899", childId: null, comment: "", status: "accepted", createdMs: Date.now() - 30 * H, trialMs: Date.now() + 20 * H },
    { id: "oa4", centerId: "demo11", centerName: mine[1].name, group: "IT · Sh, Ya · 10:00–12:00", groupIndex: 3, name: "Jasur Ahmedov", phone: "+998998887766", childId: null, comment: "Python o‘rganmoqchi", status: "new", createdMs: Date.now() - 2 * H, trialMs: null }
  ];
  const ownerListeners = new Set<() => void>();
  const ownerEmit = () => ownerListeners.forEach((l) => l());
  const ownerSub = (fn: () => void) => {
    ownerListeners.add(fn);
    fn();
    return () => void ownerListeners.delete(fn);
  };

  return {
    mode: "demo",
    owner: {
      watchMyCenters: (cb) => ownerSub(() => cb(mine.map((c) => ({ ...c, groups: c.groups.map((g) => ({ ...g })) })))),
      async saveGroups(centerId, groups) {
        const c = mine.find((x) => x.id === centerId);
        if (c) c.groups = groups.map((g) => ({ ...g }));
        ownerEmit();
      },
      watchCenterApplications: (centerId, cb) => ownerSub(() => cb(ownerApps.filter((a) => a.centerId === centerId).map((a) => ({ ...a })))),
      async setApplicationStatus(app, status, trialMs) {
        const a = ownerApps.find((x) => x.id === app.id);
        if (a) Object.assign(a, { status, trialMs });
        ownerEmit();
      }
    },
    authed: true,
    centerChatEnabled: true,
    aiEnabled: false,

    async loadCenters() {
      await new Promise((r) => setTimeout(r, 450)); // skeleton ko‘rinsin
      return structuredClone(DEMO_CENTERS);
    },
    async loadReviews(centerId) {
      const c = DEMO_CENTERS.find((x) => x.id === centerId);
      return c && c.reviewsCount > 0 ? DEMO_REVIEWS : [];
    },

    async submitApplication(input: ApplyInput) {
      await new Promise((r) => setTimeout(r, 600));
      const g = input.center.groups[input.groupIndex];
      const app: Application = {
        id: uid(),
        centerId: input.center.id,
        centerName: input.center.name,
        group: `${g.subject} · ${g.days.join(", ")} · ${g.time}`,
        groupIndex: input.groupIndex,
        name: input.name,
        phone: input.phone,
        childId: input.childId,
        comment: input.comment,
        status: "new",
        createdMs: Date.now(),
        trialMs: null
      };
      state.apps.unshift(app);
      setStatus(app.id, "new");
      // Markaz javobi simulyatsiyasi: ko‘rildi → qabul qilindi
      setTimeout(() => setStatus(app.id, "seen"), 4000);
      setTimeout(() => setStatus(app.id, "accepted"), 9000);
      return app;
    },
    watchApplications(cb) {
      return sub(() => cb([...state.apps]));
    },
    async joinWaitlist() {
      await new Promise((r) => setTimeout(r, 400));
    },

    async loadProfile() {
      return null; // DEMO’da profil faqat lokal (zustand persist)
    },
    async saveProfile(_patch: Partial<ProfileDoc>) {},

    watchChats(cb) {
      return sub(() => cb([...state.chats].sort((a, b) => b.lastMs - a.lastMs)));
    },
    watchMessages(chatId, cb) {
      return sub(() => cb([...(state.messages[chatId] || [])]));
    },
    async openCenterChat(center) {
      const id = ensureChat(center);
      save();
      return id;
    },
    async sendMessage(chatId, text) {
      pushMsg(chatId, { from: "user", text });
      const reply = DEMO_CENTER_REPLIES[Math.floor(Math.random() * DEMO_CENTER_REPLIES.length)];
      setTimeout(() => typingListeners.forEach((l) => l(chatId, true)), 900);
      setTimeout(() => {
        typingListeners.forEach((l) => l(chatId, false));
        pushMsg(chatId, { from: "center", text: reply }, 1);
      }, 2600);
    },
    async markRead(chatId) {
      const c = state.chats.find((x) => x.id === chatId);
      if (c && c.unread) {
        c.unread = 0;
        save();
      }
    },
    async deleteChat(chatId) {
      state.chats = state.chats.filter((c) => c.id !== chatId);
      delete state.messages[chatId];
      save();
    },
    onTyping(cb) {
      typingListeners.add(cb);
      return () => typingListeners.delete(cb);
    },

    async askAI(query, _history, ctx) {
      await new Promise((r) => setTimeout(r, 1100));
      return { ...ruleBasedReply(ctx.centers.length ? ctx.centers : DEMO_CENTERS, query, ctx.pos || RISHTON), fallback: true };
    }
  };
}
