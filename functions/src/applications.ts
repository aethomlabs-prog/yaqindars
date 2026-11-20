/* Ariza yuborish (callable submitApplication) — spamdan himoya shu yerda:
 * bitta uid dan kuniga ≤5, bitta markazga ≤2, bitta telefondan kuniga ≤5.
 * Hisoblagichlar kunlik hujjatlarda (counters/…), har ariza uchun alohida so'rov yo'q. */
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { SOURCE_RE, applicationLimitError, normalizePhone, tashkentDate } from "@yaqindars/shared";

export class AppError extends Error {
  constructor(public code: "invalid-argument" | "not-found" | "resource-exhausted" | "failed-precondition", message: string) {
    super(message);
  }
}

export interface ApplyInput {
  centerId: string;
  groupIndex: number;
  name: string;
  phone: string;
  childId?: string | null;
  comment?: string;
  source?: string | null;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function validateInput(raw: unknown): ApplyInput {
  const x = (raw ?? {}) as Record<string, unknown>;
  const centerId = str(x.centerId, 64);
  const name = str(x.name, 60);
  const phone = normalizePhone(str(x.phone, 30));
  const groupIndex = Number(x.groupIndex);
  if (!centerId || centerId.includes("/")) throw new AppError("invalid-argument", "Markaz tanlanmagan.");
  if (name.length < 2) throw new AppError("invalid-argument", "Ismingizni yozing.");
  if (!phone) throw new AppError("invalid-argument", "Telefon raqam noto‘g‘ri. Masalan: +998 90 123 45 67");
  if (!Number.isInteger(groupIndex) || groupIndex < 0 || groupIndex >= 20) throw new AppError("invalid-argument", "Guruh tanlanmagan.");
  const source = typeof x.source === "string" && SOURCE_RE.test(x.source) ? x.source : null;
  const childId = typeof x.childId === "string" && x.childId.length <= 64 ? x.childId : null;
  return { centerId, groupIndex, name, phone, childId, comment: str(x.comment, 300), source };
}

export async function submitApplication(db: Firestore, uid: string, raw: unknown, now = Date.now()) {
  const input = validateInput(raw);
  const date = tashkentDate(now);
  const centerRef = db.collection("centers").doc(input.centerId);
  const uidRef = db.collection("counters").doc(`app_uid_${uid}_${date}`);
  const phoneRef = db.collection("counters").doc(`app_phone_${input.phone.slice(1)}_${date}`);
  const appRef = db.collection("applications").doc();

  await db.runTransaction(async (t) => {
    const [centerSnap, uidSnap, phoneSnap] = await Promise.all([t.get(centerRef), t.get(uidRef), t.get(phoneRef)]);
    const c = centerSnap.data();
    if (!c || c.approved !== true || c.hidden === true) throw new AppError("not-found", "Markaz topilmadi yoki vaqtincha ko‘rinmaydi.");
    const g = Array.isArray(c.groups) ? c.groups[input.groupIndex] : null;
    if (!g) throw new AppError("invalid-argument", "Guruh topilmadi — sahifani yangilang.");
    const u = uidSnap.data() ?? {};
    const err = applicationLimitError({
      uidToday: Number(u.total) || 0,
      uidCenterToday: Number((u.centers ?? {})[input.centerId]) || 0,
      phoneToday: Number(phoneSnap.data()?.total) || 0
    });
    if (err) throw new AppError("resource-exhausted", err);
    const days = Array.isArray(g.days) ? g.days.join(", ") : "";
    t.set(appRef, {
      centerId: input.centerId,
      centerName: String(c.name ?? "").slice(0, 100),
      group: [g.subject, days, g.time].filter(Boolean).join(" · ").slice(0, 120),
      groupIndex: input.groupIndex,
      name: input.name,
      phone: input.phone,
      childId: input.childId,
      comment: input.comment ?? "",
      uid,
      source: input.source,
      status: "new",
      notified: false,
      createdAt: FieldValue.serverTimestamp()
    });
    t.set(uidRef, { total: FieldValue.increment(1), centers: { [input.centerId]: FieldValue.increment(1) }, date }, { merge: true });
    t.set(phoneRef, { total: FieldValue.increment(1), date }, { merge: true });
  });
  return { id: appRef.id };
}
