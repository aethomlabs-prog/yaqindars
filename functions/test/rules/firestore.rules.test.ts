/* firestore.rules — asosiy ruxsatlar (emulator bilan). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp, deleteDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085").split(":");

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-yaqindars",
    firestore: { rules: readFileSync(resolve(__dirname, "../../../firestore.rules"), "utf8"), host, port: Number(port) }
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "centers/pub"), { name: "Ochiq", approved: true, ownerUids: ["tg_1"], phone: "+998900000001", lat: 1, lng: 1, groups: [] });
    await setDoc(doc(db, "centers/pend"), { name: "Kutilmoqda", approved: false, ownerUids: ["tg_1"], phone: "+998900000001", lat: 1, lng: 1 });
    await setDoc(doc(db, "centers/legacy"), { name: "Eski", approved: true, ownerTgId: 99, phone: "+998900000001", lat: 1, lng: 1 });
    await setDoc(doc(db, "applications/a1"), { uid: "parent1", centerId: "pub", status: "new", name: "Ali", phone: "+998901112233" });
    await setDoc(doc(db, "tgLogins/tok"), { anonUid: "parent1", status: "pending", expiresAt: 0 });
    await setDoc(doc(db, "chats/parent1_pub"), { type: "center", centerId: "pub", userUid: "parent1", unreadUser: 0, unreadCenter: 0, lastMessage: "" });
  });
});

const anon = (uid: string) => env.authenticatedContext(uid).firestore();
const owner = () => env.authenticatedContext("tg_1", { tg: 1 }).firestore();
const admin = () => env.authenticatedContext("tg_777", { tg: 777, admin: true }).firestore();
const guest = () => env.unauthenticatedContext().firestore();

describe("markazlar", () => {
  test("tasdiqlangan — hamma o‘qiydi; tasdiqlanmagan — faqat egasi va admin", async () => {
    await assertSucceeds(getDoc(doc(guest(), "centers/pub")));
    await assertFails(getDoc(doc(anon("parent1"), "centers/pend")));
    await assertSucceeds(getDoc(doc(owner(), "centers/pend")));
    await assertSucceeds(getDoc(doc(admin(), "centers/pend")));
    await assertSucceeds(getDocs(query(collection(guest(), "centers"), where("approved", "==", true))));
  });

  test("egasi profilni o‘zgartiradi, lekin approved/vip/tariff/verified/paidUntil — yo‘q", async () => {
    const db = owner();
    await assertSucceeds(updateDoc(doc(db, "centers/pub"), { description: "Yangi", updatedAt: serverTimestamp() }));
    // Har bir himoyalangan maydonni HAQIQATDAN o'zgartirib ko'ramiz (pub: approved=true, qolganlari yo'q)
    const tries: Record<string, unknown> = { approved: false, vip: true, verified: true, tariff: "vip", paidUntil: new Date(), ownerUids: ["tg_1", "x"], hidden: true };
    for (const [k, v] of Object.entries(tries)) {
      await assertFails(updateDoc(doc(db, "centers/pub"), { [k]: v, updatedAt: serverTimestamp() }));
    }
    await assertFails(updateDoc(doc(anon("parent1"), "centers/pub"), { description: "x", updatedAt: serverTimestamp() }));
  });

  test("LEGACY egasi (ownerTgId) ham o‘zgartira oladi", async () => {
    const legacy = env.authenticatedContext("anonX", { tg: 99 }).firestore();
    await assertSucceeds(updateDoc(doc(legacy, "centers/legacy"), { description: "ok", updatedAt: serverTimestamp() }));
  });

  test("admin hammasini o‘zgartiradi", async () => {
    await assertSucceeds(updateDoc(doc(admin(), "centers/pend"), { approved: true, vip: true, verified: true }));
  });

  test("ro‘yxatdan o‘tish: faqat o‘zini egasi qilib, tasdiqlanmagan holda", async () => {
    const base = { name: "Yangi markaz", phone: "+998901234567", lat: 1, lng: 1, groups: [], tariff: "oddiy", vip: false, createdAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(owner(), "centers/new1"), { ...base, ownerUids: ["tg_1"], approved: false }));
    await assertFails(setDoc(doc(owner(), "centers/new2"), { ...base, ownerUids: ["tg_1"], approved: true }));
    await assertFails(setDoc(doc(owner(), "centers/new3"), { ...base, ownerUids: ["tg_2"], approved: false }));
    // Anonim (ota-ona) markaz yarata olmaydi
    await assertFails(setDoc(doc(anon("parent1"), "centers/new4"), { ...base, ownerUids: ["parent1"], approved: false }));
  });
});

describe("arizalar", () => {
  test("yangi ilova to‘g‘ridan-to‘g‘ri yarata olmaydi (faqat submitApplication)", async () => {
    await assertFails(setDoc(doc(anon("parent1"), "applications/x"), { uid: "parent1", centerId: "pub", status: "new", name: "Ali", phone: "+998901112233", notified: false, createdAt: serverTimestamp() }));
  });
  test("o‘qish: ariza egasi, markaz egasi, admin — boshqalar yo‘q", async () => {
    await assertSucceeds(getDoc(doc(anon("parent1"), "applications/a1")));
    await assertSucceeds(getDoc(doc(owner(), "applications/a1")));
    await assertSucceeds(getDoc(doc(admin(), "applications/a1")));
    await assertFails(getDoc(doc(anon("parent2"), "applications/a1")));
    await assertSucceeds(getDocs(query(collection(anon("parent1"), "applications"), where("uid", "==", "parent1"))));
  });
  test("holatni faqat markaz egasi o‘zgartiradi", async () => {
    await assertSucceeds(updateDoc(doc(owner(), "applications/a1"), { status: "accepted", statusBy: "app" }));
    await assertFails(updateDoc(doc(anon("parent1"), "applications/a1"), { status: "accepted", statusBy: "app" }));
  });
});

describe("foydalanuvchi, chat, kirish tokenlari", () => {
  test("users/{uid} — faqat o‘zi; role ni o‘zi qo‘ya olmaydi", async () => {
    await assertSucceeds(setDoc(doc(anon("parent1"), "users/parent1"), { theme: "dark" }));
    await assertSucceeds(setDoc(doc(anon("parent1"), "users/parent1/children/k1"), { name: "Aziz" }));
    await assertFails(getDoc(doc(anon("parent2"), "users/parent1")));
    await assertFails(setDoc(doc(anon("parent1"), "users/parent1"), { role: "admin" }, { merge: true }));
  });
  test("chat: ota-ona va markaz egasi; begona — yo‘q", async () => {
    await assertSucceeds(getDoc(doc(anon("parent1"), "chats/parent1_pub")));
    await assertSucceeds(getDoc(doc(owner(), "chats/parent1_pub")));
    await assertFails(getDoc(doc(anon("parent2"), "chats/parent1_pub")));
    await assertSucceeds(setDoc(doc(anon("parent1"), "chats/parent1_pub/messages/m1"), { from: "user", text: "Salom", notified: false, createdAt: serverTimestamp() }));
    await assertFails(setDoc(doc(anon("parent1"), "chats/parent1_pub/messages/m2"), { from: "center", text: "Soxta", notified: false, createdAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(owner(), "chats/parent1_pub/messages/m3"), { from: "center", text: "Javob", notified: false, createdAt: serverTimestamp() }));
  });
  test("tgLogins: faqat o‘sha anonim uid o‘qiydi, hech kim yozmaydi; counters yopiq", async () => {
    await assertSucceeds(getDoc(doc(anon("parent1"), "tgLogins/tok")));
    await assertFails(getDoc(doc(anon("parent2"), "tgLogins/tok")));
    await assertFails(setDoc(doc(anon("parent1"), "tgLogins/tok2"), { anonUid: "parent1", status: "confirmed" }));
    await assertFails(getDoc(doc(admin(), "counters/x")));
    await assertFails(deleteDoc(doc(anon("parent1"), "tgLogins/tok")));
  });
});
