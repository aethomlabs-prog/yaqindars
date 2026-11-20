/* Telegram orqali kirish (markazlar va admin) — SMS va parolsiz.
 * 1) createLogin: ilova (anonim uid) token oladi → t.me/BOT?start=login_<token>
 * 2) confirmLogin: bot /start login_<token> → tgId yoziladi, status "confirmed"
 * 3) finishLogin: ilova → custom token (uid = tg_<tgId>), anonim ma'lumotlar yangi uid ga ko'chadi */
import { randomBytes } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { TG_LOGIN, canConfirm, canFinish, isBlocked, isLoginToken, tgUid, type TgLoginDoc } from "@yaqindars/shared";

export class LoginError extends Error {
  constructor(public code: "not-found" | "permission-denied" | "failed-precondition" | "resource-exhausted" | "invalid-argument", message: string) {
    super(message);
  }
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function newToken(): string {
  const bytes = randomBytes(TG_LOGIN.tokenLength);
  let out = "";
  for (let i = 0; i < TG_LOGIN.tokenLength; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

const failsRef = (db: Firestore, uid: string) => db.collection("tgLoginFails").doc(uid);

async function assertNotBlocked(db: Firestore, uid: string, now: number) {
  const f = (await failsRef(db, uid).get()).data() as { count: number; lastMs: number } | undefined;
  if (isBlocked(f ?? null, now)) throw new LoginError("resource-exhausted", "Juda ko‘p urinish. 15 daqiqadan keyin qayta urinib ko‘ring.");
}

async function recordFail(db: Firestore, uid: string, now: number) {
  const ref = failsRef(db, uid);
  await db.runTransaction(async (t) => {
    const f = (await t.get(ref)).data() as { count: number; lastMs: number } | undefined;
    // Blok muddati o'tgan bo'lsa — hisob qaytadan
    const fresh = !f || now - f.lastMs > TG_LOGIN.blockMs;
    t.set(ref, { count: fresh ? 1 : f.count + 1, lastMs: now });
  });
}

export async function createLogin(db: Firestore, anonUid: string, now = Date.now()) {
  await assertNotBlocked(db, anonUid, now);
  const token = newToken();
  await db.collection("tgLogins").doc(token).set({
    anonUid,
    status: "pending",
    expiresAt: now + TG_LOGIN.ttlMs,
    createdAt: FieldValue.serverTimestamp()
  });
  return { token, expiresAt: now + TG_LOGIN.ttlMs };
}

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

/** Bot tomoni. Xato bo'lsa — foydalanuvchiga ko'rsatiladigan matn, muvaffaqiyatli bo'lsa null. */
export async function confirmLogin(db: Firestore, token: string, user: TgUser, now = Date.now()): Promise<string | null> {
  if (!isLoginToken(token)) return "Kirish havolasi noto‘g‘ri.";
  const ref = db.collection("tgLogins").doc(token);
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const doc = (snap.exists ? snap.data() : null) as TgLoginDoc | null;
    const err = canConfirm(doc, now);
    if (err) return err;
    t.update(ref, {
      status: "confirmed",
      tgId: user.id,
      tgUsername: user.username ?? null,
      tgName: [user.first_name, user.last_name].filter(Boolean).join(" ").slice(0, 80),
      confirmedAt: FieldValue.serverTimestamp()
    });
    return null;
  });
}

/** Anonim foydalanuvchining ma'lumotlarini yangi uid ga ko'chirish (arizalar, saqlanganlar, farzandlar, kuzatuvlar) */
export async function migrateUserData(db: Firestore, fromUid: string, toUid: string) {
  if (fromUid === toUid) return { applications: 0, watches: 0, subdocs: 0 };
  let applications = 0;
  let watches = 0;
  let subdocs = 0;
  const writer = db.bulkWriter();
  for (const d of (await db.collection("applications").where("uid", "==", fromUid).get()).docs) {
    writer.update(d.ref, { uid: toUid });
    applications++;
  }
  for (const d of (await db.collection("watches").where("userUid", "==", fromUid).get()).docs) {
    writer.update(d.ref, { userUid: toUid });
    watches++;
  }
  const fromUser = db.collection("users").doc(fromUid);
  const toUser = db.collection("users").doc(toUid);
  const profile = await fromUser.get();
  if (profile.exists) writer.set(toUser, profile.data()!, { merge: true });
  for (const sub of ["children", "favorites", "addresses"]) {
    for (const d of (await fromUser.collection(sub).get()).docs) {
      writer.set(toUser.collection(sub).doc(d.id), d.data(), { merge: true });
      writer.delete(d.ref);
      subdocs++;
    }
  }
  if (profile.exists) writer.delete(fromUser);
  await writer.close();
  return { applications, watches, subdocs };
}

/** Ilova tomoni: tasdiqlangan tokenni custom token'ga almashtirish */
export async function finishLogin(db: Firestore, auth: Auth, anonUid: string, token: string, adminTgIds: Set<number>, now = Date.now()) {
  await assertNotBlocked(db, anonUid, now);
  if (!isLoginToken(token)) {
    await recordFail(db, anonUid, now);
    throw new LoginError("invalid-argument", "Kirish so‘rovi noto‘g‘ri.");
  }
  const ref = db.collection("tgLogins").doc(token);
  const res = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    const doc = (snap.exists ? snap.data() : null) as (TgLoginDoc & { tgUsername?: string | null; tgName?: string }) | null;
    const err = canFinish(doc, anonUid, now);
    if (err) return { err };
    t.update(ref, { status: "used", usedAt: FieldValue.serverTimestamp() });
    return { doc: doc! };
  });
  if ("err" in res) {
    // «hali tasdiqlanmagan» — oddiy kutish holati, xato hisoblanmaydi
    if (!/tasdiqlanmagan/.test(res.err!)) await recordFail(db, anonUid, now);
    throw new LoginError("failed-precondition", res.err!);
  }
  const tgId = res.doc.tgId!;
  const uid = tgUid(tgId);
  const admin = adminTgIds.has(tgId);
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, displayName: res.doc.tgName || undefined });
  }
  const claims = { tg: tgId, ...(admin ? { admin: true } : {}) };
  await auth.setCustomUserClaims(uid, claims);
  // Profil: Telegram ma'lumotlari va (bo'lsa) eski users/{tgId} dan ko'chirish
  await db.collection("users").doc(uid).set(
    { tgId, tgUsername: res.doc.tgUsername ?? null, tgName: res.doc.tgName ?? "", role: admin ? "admin" : "owner", lastLoginAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  const moved = await migrateUserData(db, anonUid, uid);
  // Telegram orqali ro'yxatdan o'tgan markazlar (ownerTgId) — ownerUids ga qo'shiladi, kabinet darhol ochiladi
  const centers = await db.collection("centers").where("ownerTgId", "==", tgId).get();
  for (const c of centers.docs) await c.ref.update({ ownerUids: FieldValue.arrayUnion(uid) });
  await failsRef(db, anonUid).delete();
  const customToken = await auth.createCustomToken(uid, claims);
  return { customToken, uid, admin, centers: centers.size, moved };
}
