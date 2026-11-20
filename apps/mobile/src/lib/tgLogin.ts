/* «🏫 Markaz bo'lib kirish» — Telegram orqali (SMS va parolsiz):
 * createTgLogin → Telegram'da bot ochiladi (/start login_<token>) → bot tasdiqlaydi →
 * ilova token hujjatini kuzatadi → finishTgLogin → signInWithCustomToken. */
import { getAuth, signInWithCustomToken } from "@react-native-firebase/auth";
import { doc, onSnapshot } from "@react-native-firebase/firestore";
import { httpsCallable } from "@react-native-firebase/functions";
import * as Linking from "expo-linking";
import { db, fns } from "./firebase";

export type LoginStep = "creating" | "waiting" | "finishing" | "done";

export interface LoginResult {
  uid: string;
  admin: boolean;
  centers: number;
}

/** Xatolarni foydalanuvchiga tushunarli matnga aylantirish (Functions xabarlari allaqachon o'zbekcha) */
export function loginErrorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/network|unavailable|internet/i.test(msg)) return "Internet aloqasi yo‘q. Tekshirib, qayta urinib ko‘ring.";
  return msg && !/internal/i.test(msg) ? msg : "Kirib bo‘lmadi. Qayta urinib ko‘ring.";
}

export function loginWithTelegram(onStep: (s: LoginStep) => void): { promise: Promise<LoginResult>; cancel: () => void } {
  let unsub: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let rejectWait: ((e: Error) => void) | null = null;
  const cleanup = () => {
    unsub?.();
    unsub = null;
    if (timer) clearTimeout(timer);
  };

  const promise = (async () => {
    onStep("creating");
    const created = await httpsCallable<object, { token: string; url: string; expiresAt: number }>(fns(), "createTgLogin")({});
    const { token, url, expiresAt } = created.data;
    if (cancelled) throw new Error("Bekor qilindi.");
    await Linking.openURL(url); // Telegram ilovasi (bo'lmasa — brauzer) ochiladi
    onStep("waiting");

    await new Promise<void>((resolve, reject) => {
      rejectWait = reject;
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Vaqt tugadi (10 daqiqa). Qaytadan urinib ko‘ring."));
      }, Math.max(5_000, expiresAt - Date.now()));
      unsub = onSnapshot(
        doc(db(), "tgLogins", token),
        (snap) => {
          if (snap.data()?.status === "confirmed") {
            cleanup();
            resolve();
          }
        },
        (err) => {
          cleanup();
          reject(err);
        }
      );
    });

    onStep("finishing");
    const fin = await httpsCallable<{ token: string }, LoginResult & { customToken: string }>(fns(), "finishTgLogin")({ token });
    await signInWithCustomToken(getAuth(), fin.data.customToken);
    await getAuth().currentUser?.getIdToken(true); // yangi claim'lar (tg, admin) darhol kuchga kirsin
    onStep("done");
    return { uid: fin.data.uid, admin: fin.data.admin, centers: fin.data.centers };
  })();

  return {
    promise: promise.finally(cleanup),
    cancel: () => {
      cancelled = true;
      cleanup();
      rejectWait?.(new Error("Bekor qilindi."));
    }
  };
}
