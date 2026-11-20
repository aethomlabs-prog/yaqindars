/* Emulator bilan: Telegram orqali kirish oqimi, ma'lumot ko'chirish, ariza limitlari, webhook. */
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { TG_LOGIN } from "@yaqindars/shared";
import { createLogin, confirmLogin, finishLogin, LoginError } from "../src/login";
import { submitApplication, AppError } from "../src/applications";
import { handleUpdate } from "../src/telegram";

if (!getApps().length) initializeApp({ projectId: "demo-yaqindars" });
const db = getFirestore();
const auth = getAuth();
const ADMINS = new Set([777]);

async function clearAll() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-yaqindars/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/demo-yaqindars/accounts`, { method: "DELETE" });
}

beforeEach(clearAll);

describe("Telegram orqali kirish", () => {
  test("to‘liq oqim: token → bot tasdig‘i → custom token, eski markaz biriktiriladi", async () => {
    await db.collection("centers").doc("c1").set({ name: "Bilimdon", ownerTgId: 555, approved: true });
    await db.collection("applications").add({ uid: "anon1", centerId: "c1", status: "new" });
    await db.collection("users").doc("anon1").collection("favorites").doc("c1").set({ at: 1 });

    const { token } = await createLogin(db, "anon1");
    expect(token).toMatch(/^[A-Za-z0-9]{32}$/);
    // Hali tasdiqlanmagan
    await expect(finishLogin(db, auth, "anon1", token, ADMINS)).rejects.toThrow(/tasdiqlanmagan/);

    expect(await confirmLogin(db, token, { id: 555, username: "markaz", first_name: "Ali" })).toBeNull();
    // Ikkinchi marta tasdiqlab bo'lmaydi
    expect(await confirmLogin(db, token, { id: 555 })).toMatch(/ishlatilgan/);
    // Boshqa qurilma yakunlay olmaydi
    await expect(finishLogin(db, auth, "begona", token, ADMINS)).rejects.toThrow(/boshqa qurilma/);

    const r = await finishLogin(db, auth, "anon1", token, ADMINS);
    expect(r.uid).toBe("tg_555");
    expect(r.admin).toBe(false);
    expect(r.centers).toBe(1);
    expect(r.moved).toMatchObject({ applications: 1, subdocs: 1 });
    expect(typeof r.customToken).toBe("string");

    const c = (await db.collection("centers").doc("c1").get()).data()!;
    expect(c.ownerUids).toEqual(["tg_555"]);
    const user = await auth.getUser("tg_555");
    expect(user.customClaims).toEqual({ tg: 555 });
    const apps = await db.collection("applications").where("uid", "==", "tg_555").get();
    expect(apps.size).toBe(1);
    expect((await db.doc("users/tg_555/favorites/c1").get()).exists).toBe(true);
    expect((await db.doc("users/anon1/favorites/c1").get()).exists).toBe(false);
    // Token bir martalik
    await expect(finishLogin(db, auth, "anon1", token, ADMINS)).rejects.toThrow(/yakunlangan/);
  });

  test("admin claim ADMIN_TG_IDS bo‘yicha", async () => {
    const { token } = await createLogin(db, "anonA");
    await confirmLogin(db, token, { id: 777 });
    const r = await finishLogin(db, auth, "anonA", token, ADMINS);
    expect(r.admin).toBe(true);
    expect((await auth.getUser("tg_777")).customClaims).toEqual({ tg: 777, admin: true });
  });

  test("10 daqiqadan keyin token eskiradi", async () => {
    const t0 = Date.now();
    const { token } = await createLogin(db, "anon2", t0);
    expect(await confirmLogin(db, token, { id: 1 }, t0 + TG_LOGIN.ttlMs + 1)).toMatch(/muddati/);
  });

  test("5 ta xato urinishdan keyin 15 daqiqa blok", async () => {
    const t0 = Date.now();
    for (let i = 0; i < TG_LOGIN.maxFails; i++) {
      await expect(finishLogin(db, auth, "anon3", "x".repeat(5), ADMINS, t0 + i)).rejects.toBeInstanceOf(LoginError);
    }
    await expect(createLogin(db, "anon3", t0 + 10)).rejects.toThrow(/15 daqiqadan/);
    await expect(createLogin(db, "anon3", t0 + TG_LOGIN.blockMs + 100)).resolves.toBeTruthy();
  });
});

describe("Ariza yuborish limitlari", () => {
  beforeEach(async () => {
    for (const id of ["m1", "m2", "m3"]) {
      await db.collection("centers").doc(id).set({ name: id, approved: true, groups: [{ subject: "IT", days: ["Du"], time: "10:00", price: 1, freeSeats: 1 }] });
    }
    await db.collection("centers").doc("hid").set({ name: "x", approved: true, hidden: true, groups: [{ subject: "IT" }] });
  });
  const input = (centerId: string, phone = "+998901112233") => ({ centerId, groupIndex: 0, name: "Ali", phone });

  test("bitta markazga kuniga 2 ta", async () => {
    await submitApplication(db, "u1", input("m1"));
    await submitApplication(db, "u1", input("m1"));
    await expect(submitApplication(db, "u1", input("m1"))).rejects.toThrow(/bugun allaqachon/);
    const a = (await db.collection("applications").where("uid", "==", "u1").get()).docs[0].data();
    expect(a).toMatchObject({ centerName: "m1", group: "IT · Du · 10:00", status: "new", notified: false });
  });

  test("bitta uid dan kuniga 5 ta", async () => {
    const cs = ["m1", "m1", "m2", "m2", "m3"];
    for (const [i, c] of cs.entries()) await submitApplication(db, "u2", input(c, `+99890000000${i}`));
    await expect(submitApplication(db, "u2", input("m3", "+998900000099"))).rejects.toThrow(/juda ko‘p/);
  });

  test("bitta telefondan kuniga 5 ta (turli qurilmalar)", async () => {
    for (let i = 0; i < 5; i++) await submitApplication(db, `dev${i}`, input(["m1", "m2", "m3", "m1", "m2"][i]));
    await expect(submitApplication(db, "dev9", input("m3"))).rejects.toThrow(/telefon/);
  });

  test("noto‘g‘ri ma’lumot va yashirilgan markaz", async () => {
    await expect(submitApplication(db, "u3", { ...input("m1"), phone: "123" })).rejects.toBeInstanceOf(AppError);
    await expect(submitApplication(db, "u3", input("hid"))).rejects.toThrow(/topilmadi/);
    await expect(submitApplication(db, "u3", { ...input("m1"), groupIndex: 5 })).rejects.toThrow(/Guruh/);
  });
});

describe("Telegram webhook", () => {
  const sent: { method: string; body: Record<string, unknown> }[] = [];
  const cfg = { token: "TEST", androidUrl: "https://play.google.com/x", iosUrl: "", loginReturnUrl: "https://yaqindars.uz/login" };
  const realFetch = global.fetch;
  beforeAll(() => {
    // Faqat Telegram API so'rovlarini ushlaymiz; emulyatorga so'rovlar haqiqiy fetch bilan
    global.fetch = (async (url: string, init?: { body?: string }) => {
      if (!String(url).startsWith("https://api.telegram.org/")) return realFetch(url, init as RequestInit);
      sent.push({ method: String(url).split("/").pop()!, body: JSON.parse(init?.body ?? "{}") });
      return { json: async () => ({ ok: true }) };
    }) as unknown as typeof fetch;
  });
  afterAll(() => (global.fetch = realFetch));
  beforeEach(() => (sent.length = 0));

  test("/start login_<token> → tasdiqlanadi va «Ilovaga qaytish» tugmasi", async () => {
    const { token } = await createLogin(db, "anon9");
    const r = await handleUpdate(db, cfg, { message: { chat: { id: 5, type: "private" }, from: { id: 5, first_name: "Vali" }, text: `/start login_${token}` } });
    expect(r).toBe("login-ok");
    expect((await db.collection("tgLogins").doc(token).get()).data()).toMatchObject({ status: "confirmed", tgId: 5 });
    expect(JSON.stringify(sent[0].body)).toContain("yaqindars.uz/login");
  });

  test("oddiy /start — ilovani yuklab olish havolalari va kanal", async () => {
    const r = await handleUpdate(db, cfg, { message: { chat: { id: 5, type: "private" }, from: { id: 5 }, text: "/start c_abc" } });
    expect(r).toBe("welcome");
    const body = JSON.stringify(sent[0].body);
    expect(body).toContain("play.google.com");
    expect(body).toContain("t.me/yaqindars_uz");
  });

  test("guruh chatlari e’tiborsiz qoldiriladi", async () => {
    expect(await handleUpdate(db, cfg, { message: { chat: { id: -1, type: "group" }, from: { id: 5 }, text: "/start" } })).toBe("skip");
    expect(sent).toHaveLength(0);
  });
});
