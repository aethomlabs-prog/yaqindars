/* Sessiya: ota-onalar — ko'rinmas Firebase Anonymous Auth (kirish ekrani yo'q).
 * Markaz va admin — Telegram orqali kirgach custom token (uid = tg_<tgId>, claim'lar: tg, admin). */
import { getAuth, onAuthStateChanged, signInAnonymously, signOut } from "@react-native-firebase/auth";
import { create } from "zustand";

export interface Session {
  ready: boolean;
  uid: string | null;
  /** true — oddiy foydalanuvchi (ota-ona), false — Telegram orqali kirgan markaz/admin */
  anon: boolean;
  tgId: number | null;
  admin: boolean;
  /** anonim kirish bo'lmadi (internet yo'q) — keyinroq qayta urinamiz */
  offline: boolean;
}

export const useSession = create<Session>(() => ({ ready: false, uid: null, anon: true, tgId: null, admin: false, offline: false }));

async function ensureAnon(attempt = 0): Promise<void> {
  try {
    await signInAnonymously(getAuth());
  } catch {
    useSession.setState({ ready: true, offline: true });
    // internet qaytishini kutib, qayta urinamiz (2, 4, 8 … 60 s)
    setTimeout(() => ensureAnon(attempt + 1), Math.min(60, 2 ** (attempt + 1)) * 1000);
  }
}

/** Ilova ochilganda bir marta chaqiriladi. Qaytaradi: obunani bekor qilish. */
export function startSession(): () => void {
  return onAuthStateChanged(getAuth(), async (user) => {
    if (!user) {
      await ensureAnon();
      return;
    }
    const token = await user.getIdTokenResult().catch(() => null);
    const claims = (token?.claims ?? {}) as Record<string, unknown>;
    useSession.setState({
      ready: true,
      offline: false,
      uid: user.uid,
      anon: user.isAnonymous,
      tgId: typeof claims.tg === "number" ? claims.tg : null,
      admin: claims.admin === true
    });
  });
}

/** Profil → «Markaz rejimidan chiqish»: yangi anonim sessiya boshlanadi */
export async function leaveCenterMode() {
  await signOut(getAuth());
}
