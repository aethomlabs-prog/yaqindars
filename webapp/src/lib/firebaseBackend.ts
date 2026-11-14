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
import { FIREBASE_CONFIG, FUNCTIONS_URL } from "../../config";
import type { ApplyInput, Backend, OwnerApi, OwnerCenter, ProfileDoc } from "./backend";
import { centerChatId } from "./backend";
import { ruleBasedReply } from "./match";
import { initData, tgUser } from "./telegram";
import type { Application, AppStatus, Center, Chat, Child, Day, Message } from "./types";

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
    rating: num(d.rating),
    reviewsCount: num(d.reviewsCount) ?? 0,
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
    updatedMs: ms(d.updatedAt)
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
  /** Telegram ichidamiz, lekin bot javob bermadi / xato — foydalanuvchiga ko‘rsatiladi */
  offline: boolean;
}

async function linkTelegram(auth: Auth, db: Firestore): Promise<LinkResult> {
  if (!initData || !tgUser) return { tg: null, offline: false }; // brauzer yoki klaviatura tugmasi — mehmon rejimi normal
  try {
    await auth.authStateReady();
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    const cached = await user.getIdTokenResult();
    if (cached.claims.tg === tgUser.id) return { tg: tgUser.id, offline: false };

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
    return { tg, offline: !tg };
  } catch (e) {
    console.warn("Telegram tasdiqlash ishlamadi:", e);
    return { tg: null, offline: true };
  }
}

export async function createFirebaseBackend(): Promise<Backend> {
  const app = initializeApp(FIREBASE_CONFIG!);
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const auth = getAuth(app);

  const [link, meta] = await Promise.all([
    linkTelegram(auth, db),
    getDoc(doc(db, "meta", "public")).then((d) => d.data() ?? null).catch(() => null)
  ]);
  // Firestore yo'llari (users/{id}, chats/{id}_...) Telegram ID bo'yicha
  const tg = link.tg;
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
                  return { ...toCenter(d.id, x), approved: x.approved === true, tariff: x.tariff === "vip" || x.tariff === "oddiy" ? x.tariff : null };
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
        }
      }
    : undefined;

  const backend: Backend = {
    owner,
    mode: "firebase",
    authed,
    offline: link.offline,
    botUsername: typeof meta?.botUsername === "string" ? meta.botUsername : undefined,
    centerChatEnabled: authed,
    aiEnabled: authed && !!FUNCTIONS_URL,

    async loadCenters() {
      const snap = await getDocs(query(collection(db, "centers"), where("approved", "==", true)));
      return snap.docs.map((d) => toCenter(d.id, d.data())).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
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
      if (uid && FUNCTIONS_URL) {
        try {
          const token = await auth.currentUser!.getIdToken();
          const r = await fetch(`${FUNCTIONS_URL.replace(/\/$/, "")}/aiChat`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ query: q, history: history.slice(-8), pos: ctx.pos })
          });
          if (r.ok) {
            const j = await r.json();
            if (typeof j.text === "string") return { text: j.text, cards: Array.isArray(j.cards) ? j.cards.slice(0, 3) : [] };
          }
        } catch (e) {
          console.warn("aiChat:", e);
        }
      }
      return { ...ruleBasedReply(ctx.centers, q, ctx.pos), fallback: true };
    }
  };
  return backend;
}
