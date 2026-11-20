/* YaqinDars Cloud Functions (2-avlod, Node 20).
 * Maxfiy kalitlar faqat Secret Manager'da: BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (keyin GROQ_API_KEY).
 * 1-bosqich: Telegram orqali kirish, ariza yuborish (limitlar bilan). */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { CONTACT } from "@yaqindars/shared";
import { AppError, submitApplication as submitApp } from "./applications";
import { LoginError, createLogin, finishLogin } from "./login";
import { handleUpdate } from "./telegram";

initializeApp();
setGlobalOptions({ maxInstances: 10 });

const BOT_TOKEN = defineSecret("BOT_TOKEN");
const WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");
/** Admin bo'ladigan Telegram ID'lar, vergul bilan (masalan "8724003008") */
const ADMIN_TG_IDS = defineString("ADMIN_TG_IDS", { default: "" });
const ANDROID_URL = defineString("ANDROID_URL", { default: "" });
const IOS_URL = defineString("IOS_URL", { default: "" });

const db = () => getFirestore();
const adminIds = () =>
  new Set(
    ADMIN_TG_IDS.value()
      .split(",")
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isInteger(x) && x > 0)
  );

function rethrow(e: unknown): never {
  if (e instanceof LoginError || e instanceof AppError) throw new HttpsError(e.code, e.message);
  console.error(e);
  throw new HttpsError("internal", "Xatolik yuz berdi. Keyinroq urinib ko‘ring.");
}

function needAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Ilovani qayta oching.");
  return uid;
}

/** Ilova: «Markaz bo'lib kirish» → token va Telegram havolasi */
export const createTgLogin = onCall(async (req) => {
  const uid = needAuth(req.auth?.uid);
  try {
    const { token, expiresAt } = await createLogin(db(), uid);
    return { token, expiresAt, url: `https://t.me/${CONTACT.bot}?start=login_${token}` };
  } catch (e) {
    rethrow(e);
  }
});

/** Ilova: Telegram'da tasdiqlangach — custom token (uid = tg_<tgId>) */
export const finishTgLogin = onCall(async (req) => {
  const uid = needAuth(req.auth?.uid);
  const token = String((req.data as { token?: unknown })?.token ?? "");
  try {
    return await finishLogin(db(), getAuth(), uid, token, adminIds());
  } catch (e) {
    rethrow(e);
  }
});

/** Ota-ona arizasi — limitlar shu yerda tekshiriladi */
export const submitApplication = onCall(async (req) => {
  const uid = needAuth(req.auth?.uid);
  try {
    return await submitApp(db(), uid, req.data);
  } catch (e) {
    rethrow(e);
  }
});

/** Telegram webhook: setWebhook'da secret_token beriladi, har so'rovda tekshiriladi */
export const telegramWebhook = onRequest({ secrets: [BOT_TOKEN, WEBHOOK_SECRET] }, async (req, res) => {
  if (req.method !== "POST" || req.get("X-Telegram-Bot-Api-Secret-Token") !== WEBHOOK_SECRET.value()) {
    res.status(403).send("forbidden");
    return;
  }
  try {
    await handleUpdate(db(), {
      token: BOT_TOKEN.value(),
      androidUrl: ANDROID_URL.value(),
      iosUrl: IOS_URL.value(),
      loginReturnUrl: `${CONTACT.site}/login`
    }, req.body);
  } catch (e) {
    console.error("telegramWebhook:", e);
  }
  res.status(200).send("ok");
});
