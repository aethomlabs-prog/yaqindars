/* DEMO backend: hammasi qurilmada (localStorage), markaz javoblari va ariza holatlari simulyatsiya qilinadi. */
import type { AdminApi, AdminCenter, ApplyInput, Backend, OwnerCenter, ProfileDoc } from "../lib/backend";
import { centerChatId } from "../lib/backend";
import { nextLessonMs } from "../lib/format";
import { RISHTON } from "../lib/geo";
import { ruleBasedReply } from "../lib/match";
import type { Application, AppStatus, Center, Chat, Message, Watch } from "../lib/types";
import { WATCH_LIMIT } from "../lib/watch";
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
  // Saqlangan qidiruvlar (DEMO — qurilmada)
  const WKEY = "yd-demo-watches";
  let watches: Watch[] = [];
  try {
    watches = JSON.parse(localStorage.getItem(WKEY) || "[]");
  } catch {
    /* bo‘sh */
  }
  const watchListeners = new Set<() => void>();
  const saveWatches = () => {
    try {
      localStorage.setItem(WKEY, JSON.stringify(watches));
    } catch {
      /* xususiy rejim */
    }
    watchListeners.forEach((l) => l());
  };
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
    tariff: c.vip ? "vip" : "oddiy",
    // namuna: biri sinov oyida, biri to‘langan
    createdMs: c.id === "demo1" ? Date.now() - 12 * 86400000 : Date.now() - 50 * 86400000,
    paidUntilMs: c.id === "demo1" ? null : Date.now() + 18 * 86400000
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

  // DEMO admin: tasdiqlangan markazlar + 2 ta kutilayotgan, 30 kunlik namuna arizalar
  const DAYMS = 86400000;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const adminCenters: AdminCenter[] = [
    ...DEMO_CENTERS.map((c, i) => ({ ...structuredClone(c), approved: true, tariff: (c.vip ? "vip" : "oddiy") as "vip" | "oddiy", ownerTgId: c.claimed ? 100000 + i : null, ownerUsername: c.claimed ? `markaz_${i + 1}` : null,
      createdMs: Date.now() - (i % 3 === 0 ? 10 : 45 + i) * DAYMS,
      // namuna: ba'zilari to‘lagan, ba'zilarining muddati o‘tgan
      paidUntilMs: i % 3 === 0 ? null : i % 3 === 1 ? Date.now() + (5 + i) * DAYMS : Date.now() - (2 + i) * DAYMS })),
    ...["Namuna: Yangi Avlod", "Namuna: Bolajon to‘garagi"].map((name, i) => ({
      ...structuredClone(DEMO_CENTERS[i + 2]),
      id: `pending${i}`,
      name,
      vip: false,
      approved: false,
      tariff: (i === 0 ? "vip" : "oddiy") as "vip" | "oddiy",
      ownerTgId: 200000 + i,
      ownerUsername: i === 0 ? "yangi_avlod" : null,
      createdMs: Date.now() - (i + 1) * 3600000,
      paidUntilMs: null
    }))
  ];
  const STAT: AppStatus[] = ["new", "seen", "accepted", "accepted", "rejected"];
  const NAMES = ["Nodira", "Sardor", "Gulbahor", "Jasur", "Malika", "Bekzod", "Dilnoza", "Aziz", "Shahlo", "Otabek"];
  const adminApps: (Application & { tgUsername: string | null })[] = [];
  for (let d = 29; d >= 0; d--) {
    const n = Math.round(1 + rnd() * 4 + (29 - d) / 8);
    for (let k = 0; k < n; k++) {
      const c = DEMO_CENTERS[Math.floor(rnd() * DEMO_CENTERS.length)];
      const gi = Math.floor(rnd() * c.groups.length);
      const g = c.groups[gi];
      const age = d * DAYMS + Math.floor(rnd() * DAYMS);
      adminApps.push({
        id: `aa${d}_${k}`, centerId: c.id, centerName: c.name, group: `${g.subject} · ${g.days.join(", ")} · ${g.time}`, groupIndex: gi,
        name: NAMES[Math.floor(rnd() * NAMES.length)], phone: `+99890${String(1000000 + Math.floor(rnd() * 8999999))}`, childId: null, comment: "",
        status: d < 1 ? "new" : STAT[Math.floor(rnd() * STAT.length)], createdMs: Date.now() - age, trialMs: null, tgUsername: rnd() > 0.5 ? `ota${k}` : null
      });
    }
  }
  const admin: AdminApi = {
    async loadCenters() {
      await new Promise((r) => setTimeout(r, 300));
      return adminCenters.map((c) => ({ ...c }));
    },
    async loadApplications(sinceMs) {
      return adminApps.filter((a) => a.createdMs >= sinceMs).sort((a, b) => b.createdMs - a.createdMs);
    },
    async loadLogs() {
      return [
        { id: "l1", source: "web", message: "TypeError: Cannot read properties of undefined (reading 'lat')", screen: "map", device: "Telegram android v8.0 · 393×851", createdMs: Date.now() - 2 * 3600000 },
        { id: "l2", source: "bot", message: "Update 912 ni qayta ishlashda xato (user 5512, tugma: 'g:demo1:0:inc')", screen: "yaqindars", device: "server · Python 3.12", createdMs: Date.now() - 26 * 3600000 }
      ];
    },
    async counts() {
      return { chats: state.chats.length, waitlist: 6, ai24h: 14 };
    },
    async markPaid(c, months) {
      const x = adminCenters.find((y) => y.id === c.id);
      const until = Math.max(Date.now(), c.paidUntilMs ?? 0, c.createdMs + 30 * DAYMS) + months * 30 * DAYMS;
      if (x) x.paidUntilMs = until;
      return until;
    },
    async setVerified(c, on) {
      const x = adminCenters.find((y) => y.id === c.id);
      if (x) Object.assign(x, { verified: on, verifiedMs: on ? Date.now() : null });
    },
    async loadDaily(sinceDate) {
      const out = [];
      for (let d = 29; d >= 0; d--) {
        const date = new Date(Date.now() + 5 * 3600000 - d * DAYMS).toISOString().slice(0, 10);
        if (date < sinceDate) continue;
        const apply = adminApps.filter((a) => new Date(a.createdMs + 5 * 3600000).toISOString().slice(0, 10) === date).length;
        const open = Math.round(40 + rnd() * 30 + (29 - d) * 2);
        out.push({ date, open, view: Math.round(open * (0.45 + rnd() * 0.2)), apply, accept: Math.round(apply * 0.4) });
      }
      return out;
    },
    async loadSources() {
      return [
        { source: "src_flyer", users: 84, apps: 11 },
        { source: "src_maktab", users: 57, apps: 9 },
        { source: "src_instagram", users: 132, apps: 7 },
        { source: "c_demo1", users: 41, apps: 6 },
        { source: "src_stiker", users: 12, apps: 1 }
      ];
    },
    async remindStale() {
      await new Promise((r) => setTimeout(r, 400));
    },
    async addCenter(input) {
      const id = `quick${adminCenters.length}`;
      adminCenters.unshift({
        id, name: input.name, address: "Xaritada ko‘rsatilgan", lat: input.lat, lng: input.lng, phone: input.phone, amenities: [], vip: false,
        rating: null, reviewsCount: 0, description: "", ageFrom: null, ageTo: null, photoUrl: null, kind: "center", teachers: [], claimed: false, verified: false, verifiedMs: null,
        groups: (input.subjects.length ? input.subjects : ["Boshqa"]).map((subject) => ({ subject, days: [], time: "", price: input.price, freeSeats: 0 })),
        updatedMs: Date.now(), approved: true, tariff: null, ownerTgId: null, ownerUsername: null, createdMs: Date.now(), paidUntilMs: null
      });
      return id;
    },
    async setCenter(c, patch) {
      const x = adminCenters.find((y) => y.id === c.id);
      if (!x) return;
      if (patch.status === "rejected") adminCenters.splice(adminCenters.indexOf(x), 1);
      else Object.assign(x, { approved: true, vip: patch.vip });
    }
  };

  return {
    mode: "demo",
    admin,
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
      },
      async requestQr() {
        await new Promise((r) => setTimeout(r, 400));
      }
    },
    watchWatches(cb) {
      const emit = () => cb(watches.map((w) => ({ ...w })));
      watchListeners.add(emit);
      emit();
      return () => void watchListeners.delete(emit);
    },
    async addWatch(w) {
      if (watches.length >= WATCH_LIMIT) throw new Error("limit");
      watches.unshift({ ...w, id: `w${Date.now()}`, createdMs: Date.now() });
      saveWatches();
    },
    async deleteWatch(id) {
      watches = watches.filter((w) => w.id !== id);
      saveWatches();
    },
    async reportCenter() {
      await new Promise((r) => setTimeout(r, 400));
    },
    async requestClaim() {
      await new Promise((r) => setTimeout(r, 400));
    },
    track() {},
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

    async deleteMyData() {
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* private rejim */
      }
      return "done";
    },

    async askAI(query, _history, ctx) {
      await new Promise((r) => setTimeout(r, 1100));
      return { ...ruleBasedReply(ctx.centers.length ? ctx.centers : DEMO_CENTERS, query, ctx.pos || RISHTON), fallback: true };
    }
  };
}
