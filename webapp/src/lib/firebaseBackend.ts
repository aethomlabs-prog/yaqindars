/* Firebase backend. Bu modul va Firebase SDK faqat FIREBASE_CONFIG bo‘lsa (lazy) yuklanadi. */
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  initializeFirestore,
  getCountFromServer,
  limit,
  getDocsFromCache,
  getDocsFromServer,
  persistentLocalCache,
  persistentMultipleTabManager,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
  type DocumentData,
  type Firestore
} from "firebase/firestore";
import { FIREBASE_CONFIG } from "../../config";
import type { AdminApi, AdminCenter, ApplyInput, Backend, CenterEvent, OwnerApi, OwnerCenter, ProfileDoc } from "./backend";
import { appSource, tashkentDate } from "./source";
import { centerChatId } from "./backend";
import { billingOf, extendUntil } from "./billing";
import { ruleBasedReply } from "./match";
import { initData, tgUser } from "./telegram";
import { WATCH_LIMIT } from "./watch";
import type { Application, AppStatus, Center, Chat, Child, Day, Message, Watch } from "./types";

const ms = (t: unknown): number => {
  const ts = t as Timestamp | null | undefined;
  return ts && typeof ts.toMillis === "function" ? ts.toMillis() : typeof t === "number" ? t : 0;
};
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function toCenter(id: string, d: DocumentData): Center {
  return {
    id,
    name: str(d.name, 100),
    address: str(d.address, 200),
    lat: Number(d.lat),
    lng: Number(d.lng),
    phone: str(d.phone, 20),
    amenities: Array.isArray(d.amenities) ? d.amenities.map((a: unknown) => str(a, 40)).filter(Boolean) : [],
    vip: d.vip === true,
    // Ota-onalar bahosi: kamida 3 ta bo‘lsa o‘rtacha, aks holda null («Yangi»)
    rating: (num(d.ratingCount) ?? 0) >= 3 ? Math.round(((num(d.ratingSum) ?? 0) / (num(d.ratingCount) as number)) * 10) / 10 : null,
    reviewsCount: num(d.ratingCount) ?? 0,
    description: str(d.description, 1000),
    ageFrom: num(d.ageFrom),
    ageTo: num(d.ageTo),
    photoUrl: typeof d.photoUrl === "string" && d.photoUrl.startsWith("https://") ? d.photoUrl : null,
    kind: d.kind === "tutor" ? "tutor" : "center",
    groups: (Array.isArray(d.groups) ? d.groups : []).map((g: DocumentData) => ({
      subject: str(g.subject, 40) || "Boshqa",
      days: (Array.isArray(g.days) ? g.days : []) as Day[],
      time: str(g.time, 20),
      price: Number(g.price) || 0,
      freeSeats: Number(g.freeSeats) || 0
    })),
    teachers: (Array.isArray(d.teachers) ? d.teachers : []).slice(0, 12).map((t: DocumentData) => ({
      name: str(t.name, 60),
      subject: str(t.subject, 40),
      experience: num(t.experience),
      about: str(t.about, 120)
    })),
    updatedMs: ms(d.updatedAt),
    claimed: d.claimed !== false
  };
}

const STATUSES: AppStatus[] = ["new", "seen", "accepted", "rejected"];

function toApp(id: string, d: DocumentData): Application {
  return {
    id,
    centerId: str(d.centerId, 64),
    centerName: str(d.centerName, 100),
    group: str(d.group, 120),
    groupIndex: Number(d.groupIndex) || 0,
    name: str(d.name, 60),
    phone: str(d.phone, 20),
    childId: typeof d.childId === "string" ? d.childId : null,
    comment: str(d.comment, 300),
    status: STATUSES.includes(d.status) ? d.status : "new",
    createdMs: ms(d.createdAt) || Date.now(),
    trialMs: ms(d.trialAt) || null
  };
}

/**
 * Telegram orqali tasdiqlash (server/Cloud Functions shart emas):
 * Mini App anonim kiradi → initData'ni tgLinks/{uid} ga yozadi → bot imzoni tekshirib "tg" claim qo'yadi.
 * Claim anonim akkauntda saqlanadi — keyingi ochilishlarda kutish yo'q.
 */
interface LinkResult {
  tg: number | null;
  /** bot ADMIN_IDS dagilarga qo‘yadigan "admin" claim'i */
  admin?: boolean;
  /** Telegram ichidamiz, lekin bot javob bermadi / xato — foydalanuvchiga ko‘rsatiladi */
  offline: boolean;
}

const ADMIN_MODE = typeof location !== "undefined" && new URLSearchParams(location.search).get("mode") === "admin";

async function linkTelegram(auth: Auth, db: Firestore): Promise<LinkResult> {
  if (!initData || !tgUser) return { tg: null, offline: false }; // brauzer yoki klaviatura tugmasi — mehmon rejimi normal
  try {
    await auth.authStateReady();
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    // Admin panelda tokenni yangilaymiz — "admin" claim'i keyinroq qo‘shilgan bo‘lishi mumkin
    const cached = await user.getIdTokenResult(ADMIN_MODE);
    if (cached.claims.tg === tgUser.id) return { tg: tgUser.id, offline: false, admin: cached.claims.admin === true };

    const ref = doc(db, "tgLinks", user.uid);
    await setDoc(ref, { initData, status: "pending", createdAt: serverTimestamp() });
    const ok = await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (v: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsub();
        resolve(v);
      };
      const timer = setTimeout(() => finish(false), 10000); // bot o'chiq bo'lsa — mehmon rejimi
      const unsub = onSnapshot(
        ref,
        (snap) => {
          const st = snap.data()?.status;
          if (st === "ok" || st === "error") finish(st === "ok");
        },
        () => finish(false)
      );
    });
    if (!ok) return { tg: null, offline: true };
    const fresh = await user.getIdTokenResult(true);
    const tg = fresh.claims.tg === tgUser.id ? tgUser.id : null;
    return { tg, offline: !tg, admin: fresh.claims.admin === true };
  } catch (e) {
    console.warn("Telegram tasdiqlash ishlamadi:", e);
    return { tg: null, offline: true };
  }
}

/* Bitta Firebase ilovasi va Firestore — markazlarni Telegram tasdiqlashini kutmasdan yuklash uchun */
let _db: { app: ReturnType<typeof initializeApp>; db: Firestore } | null = null;
function getDb() {
  if (_db) return _db;
  const app = initializeApp(FIREBASE_CONFIG!);
  let db: Firestore;
  try {
    // Telefondagi kesh (IndexedDB): keyingi ochilishlarda markazlar darhol, internetsiz ham
    db = initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
  _db = { app, db };
  return _db;
}

const centersQuery = (db: Firestore) => query(collection(db, "centers"), where("approved", "==", true));
// hidden — to‘lov 7+ kun kechikkan (ma’lumot o‘chirilmaydi, faqat xaritada ko‘rinmaydi)
const toCenters = (docs: { id: string; data: () => DocumentData }[]) =>
  docs
    .map((d) => [d.data(), d.id] as const)
    .filter(([x]) => x.hidden !== true)
    .map(([x, id]) => toCenter(id, x))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));

/** Markazlar: avval telefondagi keshdan (bir zumda), keyin serverdan. Telegram tasdiqlashini kutmaydi. */
export async function prefetchCenters(cb: (centers: Center[], fromCache: boolean) => void): Promise<void> {
  const { db } = getDb();
  const q = centersQuery(db);
  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) cb(toCenters(cached.docs), true);
  } catch {
    /* kesh hali yo‘q */
  }
  const fresh = await getDocsFromServer(q);
  cb(toCenters(fresh.docs), false);
}

export async function createFirebaseBackend(): Promise<Backend> {
  const { app, db } = getDb();
  const auth = getAuth(app);

  const [link, meta] = await Promise.all([
    linkTelegram(auth, db),
    getDoc(doc(db, "meta", "public")).then((d) => d.data() ?? null).catch(() => null)
  ]);
  // Firestore yo'llari (users/{id}, chats/{id}_...) Telegram ID bo'yicha
  const tg = link.tg;
  // Bot GROQ_API_KEY bilan ishga tushgan bo'lsa meta/public.aiEnabled = true
  const aiOn = meta?.aiEnabled === true;
  const uid: string | null = tg ? String(tg) : null;
  const authed = !!uid;
  const tgId = uid ? Number(uid) : null;
  let cachedChildren: Child[] = [];
  let cachedFavs: string[] = [];

  const need = () => {
    if (!uid) throw new Error("auth");
    return uid;
  };

  // Ta’lim beruvchi kabineti — Firestore qoidalari faqat markaz egasiga ruxsat beradi
  const owner: OwnerApi | undefined = tgId
    ? {
        watchMyCenters(cb) {
          return onSnapshot(
            query(collection(db, "centers"), where("ownerTgId", "==", tgId)),
            (s) =>
              cb(
                s.docs.map((d): OwnerCenter => {
                  const x = d.data({ serverTimestamps: "estimate" });
                  return {
                    ...toCenter(d.id, x),
                    approved: x.approved === true,
                    tariff: x.tariff === "vip" || x.tariff === "oddiy" ? x.tariff : null,
                    createdMs: ms(x.createdAt),
                    paidUntilMs: ms(x.paidUntil) || null,
                    claimedMs: ms(x.claimedAt) || null,
                    hidden: x.hidden === true
                  };
                })
              ),
            (e) => console.warn("myCenters:", e)
          );
        },
        async saveGroups(centerId, groups) {
          await updateDoc(doc(db, "centers", centerId), {
            groups: groups.map((g) => ({ subject: g.subject, days: g.days, time: g.time, price: g.price, freeSeats: g.freeSeats })),
            updatedAt: serverTimestamp()
          });
        },
        watchCenterApplications(centerId, cb) {
          return onSnapshot(
            query(collection(db, "applications"), where("centerId", "==", centerId)),
            (s) => cb(s.docs.map((d) => toApp(d.id, d.data({ serverTimestamps: "estimate" }))).sort((a, b) => b.createdMs - a.createdMs)),
            (e) => console.warn("centerApps:", e)
          );
        },
        async setApplicationStatus(app, status, trialMs) {
          // statusBy: "web" — bot shu belgini ko‘rib ota-onaga Telegram xabarini yuboradi
          await updateDoc(doc(db, "applications", app.id), {
            status,
            statusBy: "web",
            trialAt: trialMs ? Timestamp.fromMillis(trialMs) : null
          });
        },
        async requestQr(centerId) {
          await addDoc(collection(db, "botRequests"), { type: "qr", centerId, tgId, status: "pending", createdAt: serverTimestamp() });
        }
      }
    : undefined;

  // Admin dashboard — Firestore qoidalari "admin" claim'ini tekshiradi
  const admin: AdminApi | undefined = link.admin
    ? {
        async loadCenters() {
          const snap = await getDocs(collection(db, "centers"));
          return snap.docs.map((d): AdminCenter => {
            const x = d.data({ serverTimestamps: "estimate" });
            return {
              ...toCenter(d.id, x),
              approved: x.approved === true,
              tariff: x.tariff === "vip" || x.tariff === "oddiy" ? x.tariff : null,
              ownerTgId: typeof x.ownerTgId === "number" ? x.ownerTgId : null,
              ownerUsername: typeof x.ownerUsername === "string" ? x.ownerUsername : null,
              createdMs: ms(x.createdAt),
              paidUntilMs: ms(x.paidUntil) || null,
              claimedMs: ms(x.claimedAt) || null,
              hidden: x.hidden === true
            };
          });
        },
        async loadApplications(sinceMs) {
          const snap = await getDocs(query(collection(db, "applications"), where("createdAt", ">=", Timestamp.fromMillis(sinceMs)), orderBy("createdAt", "desc")));
          return snap.docs.map((d) => {
            const x = d.data({ serverTimestamps: "estimate" });
            return { ...toApp(d.id, x), tgUsername: typeof x.tgUsername === "string" ? x.tgUsername : null };
          });
        },
        async loadLogs(n) {
          const snap = await getDocs(query(collection(db, "logs"), orderBy("createdAt", "desc"), limit(n)));
          return snap.docs.map((d) => {
            const x = d.data({ serverTimestamps: "estimate" });
            return { id: d.id, source: str(x.source, 10), message: str(x.message, 500), screen: str(x.screen, 100), device: str(x.device, 200), createdMs: ms(x.createdAt) };
          });
        },
        async counts() {
          const day = Timestamp.fromMillis(Date.now() - 86400000);
          const [chats, waitlist, ai] = await Promise.all([
            getCountFromServer(collection(db, "chats")).catch(() => null),
            getCountFromServer(collection(db, "waitlist")).catch(() => null),
            getCountFromServer(query(collection(db, "aiRequests"), where("createdAt", ">=", day))).catch(() => null)
          ]);
          return { chats: chats?.data().count ?? 0, waitlist: waitlist?.data().count ?? 0, ai24h: ai?.data().count ?? 0 };
        },
        async markPaid(c, months) {
          const until = extendUntil(billingOf(c), months);
          // To‘lov qabul qilindi — yashirilgan bo‘lsa darhol xaritaga qaytadi
          await updateDoc(doc(db, "centers", c.id), { paidUntil: Timestamp.fromMillis(until), updatedAt: serverTimestamp(), ...(c.hidden ? { hidden: false } : {}) });
          return until;
        },
        async addCenter(input) {
          const ref = await addDoc(collection(db, "centers"), {
            name: input.name.slice(0, 100),
            address: "Xaritada ko‘rsatilgan",
            lat: input.lat,
            lng: input.lng,
            phone: input.phone,
            amenities: [],
            description: "",
            kind: "center",
            groups: (input.subjects.length ? input.subjects : ["Boshqa"]).slice(0, 10).map((subject) => ({ subject, days: [], time: "", price: input.price, freeSeats: 0 })),
            teachers: [],
            vip: false,
            rating: null,
            approved: true,
            status: "approved",
            tariff: null,
            ownerTgId: null,
            ownerUsername: null,
            claimed: false,
            source: "admin",
            addedBy: tgId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastReminderAt: null
          });
          return ref.id;
        },
        async setCenter(c, patch) {
          await updateDoc(doc(db, "centers", c.id), {
            approved: patch.status === "approved",
            vip: patch.status === "approved" && patch.vip,
            status: patch.status,
            approvedBy: "web",
            updatedAt: serverTimestamp()
          });
        }
      }
    : undefined;

  const backend: Backend = {
    owner,
    admin,
    mode: "firebase",
    authed,
    offline: link.offline,
    botUsername: typeof meta?.botUsername === "string" ? meta.botUsername : undefined,
    centerChatEnabled: authed,
    inlineEnabled: meta?.inlineEnabled === true,
    aiEnabled: authed && aiOn,

    async loadCenters() {
      const snap = await getDocs(centersQuery(db));
      return toCenters(snap.docs);
    },
    async loadReviews() {
      return []; // Sharhlar — keyingi bosqich (README)
    },

    async submitApplication(input: ApplyInput) {
      const g = input.center.groups[input.groupIndex];
      const data = {
        centerId: input.center.id,
        centerName: input.center.name.slice(0, 100),
        group: `${g.subject} · ${g.days.join(", ")} · ${g.time}`.slice(0, 120),
        groupIndex: input.groupIndex,
        name: input.name.slice(0, 60),
        phone: input.phone,
        childId: input.childId,
        comment: input.comment.slice(0, 300),
        tgUserId: tgId,
        tgUsername: tgUser?.username ?? null,
        source: appSource(),
        createdAt: serverTimestamp(),
        notified: false,
        status: "new"
      };
      const ref = await addDoc(collection(db, "applications"), data);
      return toApp(ref.id, { ...data, createdAt: Date.now() });
    },
    watchApplications(cb) {
      if (!tgId) return () => {};
      const q = query(collection(db, "applications"), where("tgUserId", "==", tgId));
      return onSnapshot(
        q,
        (s) => cb(s.docs.map((d) => toApp(d.id, d.data({ serverTimestamps: "estimate" }))).sort((a, b) => b.createdMs - a.createdMs)),
        (e) => console.warn("applications:", e)
      );
    },
    async joinWaitlist(centerId, groupIndex) {
      need();
      await addDoc(collection(db, "waitlist"), { centerId, groupIndex, userTgId: tgId, createdAt: serverTimestamp(), notified: false });
    },
    watchWatches(cb) {
      if (!tgId) {
        cb([]);
        return () => {};
      }
      return onSnapshot(
        query(collection(db, "watches"), where("userTgId", "==", tgId)),
        (s) =>
          cb(
            s.docs
              .map((d): Watch => {
                const x = d.data({ serverTimestamps: "estimate" });
                return {
                  id: d.id,
                  subject: typeof x.subject === "string" ? x.subject : null,
                  radiusKm: num(x.radiusKm),
                  maxPrice: num(x.maxPrice),
                  days: (Array.isArray(x.days) ? x.days : []) as Day[],
                  lat: Number(x.lat),
                  lng: Number(x.lng),
                  createdMs: ms(x.createdAt)
                };
              })
              .sort((a, b) => b.createdMs - a.createdMs)
          ),
        (e) => console.warn("watches:", e)
      );
    },
    async addWatch(w) {
      need();
      const mine = await getDocs(query(collection(db, "watches"), where("userTgId", "==", tgId)));
      if (mine.size >= WATCH_LIMIT) throw new Error("limit");
      await addDoc(collection(db, "watches"), {
        userTgId: tgId,
        subject: w.subject,
        radiusKm: w.radiusKm,
        maxPrice: w.maxPrice,
        days: w.days,
        lat: w.lat,
        lng: w.lng,
        active: true,
        createdAt: serverTimestamp()
      });
    },
    async deleteWatch(id) {
      need();
      await deleteDoc(doc(db, "watches", id));
    },
    async requestClaim(center) {
      const u = need();
      const ref = doc(db, "claimRequests", `${u}_${center.id}`);
      // Allaqachon yuborilgan (kutilmoqda / tasdiqlangan) — qayta yubormaymiz
      const prev = await getDoc(ref).catch(() => null);
      if (prev?.exists() && prev.data()?.status !== "rejected") return;
      await setDoc(ref, {
        centerId: center.id,
        centerName: center.name.slice(0, 100),
        tgId,
        name: (tgUser?.first_name || "").slice(0, 60),
        username: tgUser?.username ?? null,
        status: "pending",
        createdAt: serverTimestamp()
      });
    },
    track(centerId: string, ev: CenterEvent) {
      // Ko‘rish — sessiyada bir marta (yangilash/qaytish hisobni shishirmasin)
      const key = `yd-ev-${ev}-${centerId}`;
      try {
        if (ev === "views") {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, "1");
        }
      } catch {
        /* xususiy rejim */
      }
      const date = tashkentDate();
      setDoc(doc(db, "centerStats", `${centerId}_${date}`), { centerId, date, [ev]: increment(1) }, { merge: true }).catch(() => {});
    },

    async loadProfile() {
      if (!uid) return null;
      const [u, kids, favs] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getDocs(collection(db, "users", uid, "children")),
        getDocs(collection(db, "users", uid, "favorites"))
      ]);
      const d = u.data() || {};
      cachedChildren = kids.docs.map((k) => {
        const x = k.data();
        return { id: k.id, name: str(x.name, 60), age: num(x.age), grade: str(x.grade, 20), interests: Array.isArray(x.interests) ? x.interests.map((i: unknown) => str(i, 30)) : [] };
      });
      cachedFavs = favs.docs.map((f) => f.id);
      const out: Partial<ProfileDoc> = { children: cachedChildren, favorites: cachedFavs };
      if (Array.isArray(d.addresses)) out.addresses = d.addresses;
      if (d.notify) out.notify = { seats: d.notify.seats !== false, reminders: d.notify.reminders !== false };
      if (d.theme) out.theme = d.theme;
      if (d.lang) out.lang = d.lang;
      return out;
    },
    async saveProfile(patch) {
      if (!uid) return;
      const userRef = doc(db, "users", uid);
      const batch = writeBatch(db);
      const userPatch: DocumentData = {};
      if (patch.addresses) userPatch.addresses = patch.addresses;
      if (patch.notify) userPatch.notify = patch.notify;
      if (patch.theme) userPatch.theme = patch.theme;
      if (patch.lang) userPatch.lang = patch.lang;
      if (Object.keys(userPatch).length) batch.set(userRef, userPatch, { merge: true });
      if (patch.children) {
        const next = new Set(patch.children.map((c) => c.id));
        cachedChildren.filter((c) => !next.has(c.id)).forEach((c) => batch.delete(doc(db, "users", uid!, "children", c.id)));
        patch.children.forEach((c) =>
          batch.set(doc(db, "users", uid!, "children", c.id), { name: c.name, age: c.age, grade: c.grade, interests: c.interests })
        );
        cachedChildren = patch.children;
      }
      if (patch.favorites) {
        const next = new Set(patch.favorites);
        const prev = new Set(cachedFavs);
        cachedFavs.filter((f) => !next.has(f)).forEach((f) => batch.delete(doc(db, "users", uid!, "favorites", f)));
        patch.favorites.filter((f) => !prev.has(f)).forEach((f) => batch.set(doc(db, "users", uid!, "favorites", f), { createdAt: serverTimestamp() }));
        cachedFavs = patch.favorites;
      }
      await batch.commit();
    },

    watchChats(cb) {
      if (!tgId) {
        cb([]);
        return () => {};
      }
      const q = query(collection(db, "chats"), where("userTgId", "==", tgId));
      return onSnapshot(
        q,
        (s) =>
          cb(
            s.docs
              .map((d): Chat => {
                const x = d.data({ serverTimestamps: "estimate" });
                return {
                  id: d.id,
                  type: "center",
                  centerId: str(x.centerId, 64),
                  title: str(x.centerName, 100) || "Markaz",
                  lastMessage: str(x.lastMessage, 200),
                  lastMs: ms(x.lastAt),
                  unread: Number(x.unreadUser) || 0
                };
              })
              .filter((c) => c.lastMessage || c.unread)
              .sort((a, b) => b.lastMs - a.lastMs)
          ),
        (e) => console.warn("chats:", e)
      );
    },
    watchMessages(chatId, cb) {
      const q = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
      return onSnapshot(
        q,
        (s) =>
          cb(
            s.docs.map((d) => {
              const x = d.data({ serverTimestamps: "estimate" });
              const from = ["user", "center", "ai", "system"].includes(x.from) ? x.from : "system";
              return { id: d.id, from, text: str(x.text, 2000), createdMs: ms(x.createdAt) || Date.now() } as Message;
            })
          ),
        (e) => console.warn("messages:", e)
      );
    },
    async openCenterChat(center) {
      const u = need();
      const id = centerChatId(u, center.id);
      const ref = doc(db, "chats", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          type: "center",
          centerId: center.id,
          centerName: center.name.slice(0, 100),
          userTgId: tgId,
          userName: (tgUser?.first_name || "").slice(0, 60),
          userUsername: tgUser?.username ?? null,
          lastMessage: "",
          lastAt: serverTimestamp(),
          unreadUser: 0,
          unreadCenter: 0
        });
      }
      return id;
    },
    async sendMessage(chatId, text) {
      need();
      const batch = writeBatch(db);
      batch.set(doc(collection(db, "chats", chatId, "messages")), { from: "user", text: text.slice(0, 2000), createdAt: serverTimestamp(), notified: false });
      batch.update(doc(db, "chats", chatId), { lastMessage: text.slice(0, 200), lastAt: serverTimestamp(), unreadCenter: increment(1) });
      await batch.commit();
    },
    async markRead(chatId) {
      if (!uid) return;
      await updateDoc(doc(db, "chats", chatId), { unreadUser: 0 }).catch(() => {});
    },
    async deleteChat(chatId) {
      need();
      await deleteDoc(doc(db, "chats", chatId));
    },

    async logError(e) {
      await addDoc(collection(db, "logs"), { ...e, tgUserId: tgId, createdAt: serverTimestamp() });
    },

    async deleteMyData() {
      if (!uid) return "local";
      const ref = doc(db, "deleteRequests", uid);
      await setDoc(ref, { status: "pending", createdAt: serverTimestamp() });
      // Bot o‘chirib "done" qo‘yguncha kutamiz (bot o‘chiq bo‘lsa — so‘rov saqlanadi, keyin bajariladi)
      return new Promise<"done" | "pending">((resolve) => {
        const timer = setTimeout(() => {
          unsub();
          resolve("pending");
        }, 20000);
        const unsub = onSnapshot(
          ref,
          (s) => {
            if (s.data()?.status === "done") {
              clearTimeout(timer);
              unsub();
              resolve("done");
            }
          },
          () => {
            clearTimeout(timer);
            unsub();
            resolve("pending");
          }
        );
      });
    },

    async askAI(q, history, ctx) {
      // AI (Groq) bot orqali: savol aiRequests'ga yoziladi, bot javobni shu hujjatga yozadi.
      // Bot o'chiq / kalit yo'q / xato / 30 s — oddiy qidiruv (fallback).
      if (uid && aiOn) {
        try {
          const ref = await addDoc(collection(db, "aiRequests"), {
            userTgId: tgId,
            query: q.slice(0, 500),
            history: history.slice(-8).map((h) => ({ from: h.from, text: h.text.slice(0, 500) })),
            pos: { lat: ctx.pos.lat, lng: ctx.pos.lng },
            status: "pending",
            createdAt: serverTimestamp()
          });
          const res = await new Promise<{ text: string; cards: string[] } | null>((resolve) => {
            let done = false;
            const finish = (v: { text: string; cards: string[] } | null) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              unsub();
              resolve(v);
            };
            const timer = setTimeout(() => finish(null), 30000);
            const unsub = onSnapshot(
              ref,
              (snap) => {
                const d = snap.data();
                if (d?.status === "done" && typeof d.text === "string") finish({ text: d.text, cards: Array.isArray(d.cards) ? d.cards.slice(0, 3) : [] });
                else if (d?.status === "error") finish(null);
              },
              () => finish(null)
            );
          });
          if (res) return res;
        } catch (e) {
          console.warn("aiRequests:", e);
        }
      }
      return { ...ruleBasedReply(ctx.centers, q, ctx.pos), fallback: true };
    }
  };
  return backend;
}
