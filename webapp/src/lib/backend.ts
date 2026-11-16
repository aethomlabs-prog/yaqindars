/* Ma’lumot qatlami interfeysi. DEMO — lokal; Firebase — Firestore (+ Functions bo‘lsa auth). */
import type { Application, AppStatus, Center, Chat, Child, Address, Group, Message, Review, Watch } from "./types";

export interface ApplyInput {
  center: Center;
  groupIndex: number;
  name: string;
  phone: string;
  childId: string | null;
  comment: string;
}

export interface ProfileDoc {
  children: Child[];
  favorites: string[];
  addresses: Address[];
  notify: { seats: boolean; reminders: boolean };
  theme: "auto" | "light" | "dark";
  lang: "uz" | "ru";
}

export type Unsub = () => void;

/** Ta’lim beruvchi kabineti: o‘z markazi (tasdiqlanmagan bo‘lsa ham) */
export interface OwnerCenter extends Center {
  approved: boolean;
  tariff: "oddiy" | "vip" | null;
  /** ro‘yxatdan o‘tgan vaqt (bepul sinov oyi shundan hisoblanadi) */
  createdMs: number;
  /** admin to‘lovni qabul qilgach — shu sanagacha to‘langan */
  paidUntilMs: number | null;
  /** egasi markazni egallagan vaqt (admin qo‘shgan markazlar uchun bepul oy shundan) */
  claimedMs?: number | null;
  /** to‘lov 7+ kun kechikkani uchun xaritadan yashirilgan */
  hidden?: boolean;
}

/** Admin dashboard */
export interface AdminCenter extends OwnerCenter {
  ownerTgId: number | null;
  ownerUsername: string | null;
}
export interface AdminLog {
  id: string;
  source: string;
  message: string;
  screen: string;
  device: string;
  createdMs: number;
}
export interface QuickCenterInput {
  name: string;
  lat: number;
  lng: number;
  phone: string;
  subjects: string[];
  price: number;
}
/** Kunlik voronka: ilova ochildi (qurilma/kun) → markaz ko‘rildi → ariza → qabul */
export interface DailyStat {
  date: string;
  open: number;
  view: number;
  apply: number;
  accept: number;
}
/** Manba (src_<kanal> yoki c_<markazId>): kelgan foydalanuvchilar va arizalar */
export interface SourceStat {
  source: string;
  users: number;
  apps: number;
}
export interface AdminCounts {
  chats: number;
  waitlist: number;
  ai24h: number;
}
export interface AdminApi {
  loadCenters(): Promise<AdminCenter[]>;
  /** sinceMs dan beri arizalar */
  loadApplications(sinceMs: number): Promise<(Application & { tgUsername: string | null })[]>;
  loadLogs(limit: number): Promise<AdminLog[]>;
  counts(): Promise<AdminCounts>;
  /** status: approved | rejected; vip — VIP holati */
  setCenter(c: AdminCenter, patch: { status: "approved" | "rejected"; vip: boolean }): Promise<void>;
  /** To‘lov qabul qilindi: muddatni +months oyga uzaytiradi (yangi paidUntilMs ni qaytaradi) */
  markPaid(c: AdminCenter, months: number): Promise<number>;
  /** sinceDate (YYYY-MM-DD) dan beri kunlik voronka */
  loadDaily(sinceDate: string): Promise<DailyStat[]>;
  loadSources(): Promise<SourceStat[]>;
  /** 14+ kun yangilanmagan markaz egalariga bot orqali eslatma */
  remindStale(): Promise<void>;
  /** «✓ Tasdiqlangan» belgisini qo‘yish / olish */
  setVerified(c: AdminCenter, on: boolean): Promise<void>;
  /** Tez qo‘shish: egasiz markaz (source: "admin", claimed: false) — yangi ID */
  addCenter(input: QuickCenterInput): Promise<string>;
}

export interface OwnerApi {
  watchMyCenters(cb: (c: OwnerCenter[]) => void): Unsub;
  saveGroups(centerId: string, groups: Group[]): Promise<void>;
  watchCenterApplications(centerId: string, cb: (a: Application[]) => void): Unsub;
  setApplicationStatus(app: Application, status: AppStatus, trialMs: number | null): Promise<void>;
  /** Bot QR posterini (PNG) Telegram’ga yuboradi */
  requestQr(centerId: string): Promise<void>;
}

export const REPORT_REASONS = {
  price: "Narx noto‘g‘ri",
  seats: "Bo‘sh joy haqidagi ma’lumot noto‘g‘ri",
  contact: "Manzil yoki telefon noto‘g‘ri",
  closed: "Markaz yopilgan / ishlamaydi",
  other: "Boshqa"
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

/** Markaz sahifasidagi hodisalar — kunlik agregat hisoblagich (har biri alohida hujjat emas) */
export type CenterEvent = "views" | "calls" | "routes";

export interface Backend {
  mode: "demo" | "firebase";
  /** Telegram ichida, lekin bot (server) javob bermadi — mehmon rejimida ishlayapmiz */
  offline?: boolean;
  /** Telegram orqali tasdiqlangan (custom token) foydalanuvchi bormi */
  authed: boolean;
  /** Markaz bilan chat ishlaydimi (auth kerak) */
  centerChatEnabled: boolean;
  /** Admin dashboard (faqat "admin" claim'i bor foydalanuvchi yoki DEMO) */
  admin?: AdminApi;
  /** Kabinet (faqat Telegram orqali tasdiqlangan foydalanuvchi yoki DEMO) */
  owner?: OwnerApi;
  /** Bot username (bot ishga tushganda bazaga yozadi) — «Ulashish» havolalari uchun */
  botUsername?: string;
  /** AI LLM backend ulanganmi (yo‘q bo‘lsa — qoidaga asoslangan) */
  aiEnabled: boolean;

  loadCenters(): Promise<Center[]>;
  loadReviews(centerId: string): Promise<Review[]>;

  submitApplication(input: ApplyInput): Promise<Application>;
  watchApplications(cb: (apps: Application[]) => void): Unsub;
  joinWaitlist(centerId: string, groupIndex: number): Promise<void>;
  /** «Ma’lumot noto‘g‘ri» shikoyati — adminga (Telegram ichida; kuniga bir markazga bitta) */
  reportCenter(center: Center, reason: ReportReason, comment: string): Promise<void>;
  /** «Bu mening markazim» — admin tasdiqlaydi */
  requestClaim(center: Center): Promise<void>;
  /** Saqlangan qidiruvlar (bot mos bo‘sh joy ochilganda yozadi; kuniga 3 tagacha) */
  watchWatches(cb: (w: Watch[]) => void): Unsub;
  addWatch(w: Omit<Watch, "id" | "createdMs">): Promise<void>;
  deleteWatch(id: string): Promise<void>;
  /** Bot inline rejimi yoqilganmi (ulashishda boy kartochka) */
  inlineEnabled?: boolean;
  /** Ko‘rish / qo‘ng‘iroq / yo‘l bosilishi (xatoga chidamli, jim) */
  track(centerId: string, ev: CenterEvent): void;

  /** Auth bo‘lsa — bulutdan profil; aks holda null (lokal qoladi) */
  loadProfile(): Promise<Partial<ProfileDoc> | null>;
  saveProfile(patch: Partial<ProfileDoc>): Promise<void>;

  watchChats(cb: (chats: Chat[]) => void): Unsub;
  watchMessages(chatId: string, cb: (msgs: Message[]) => void): Unsub;
  /** Markaz bilan suhbat: chatId qaytaradi (yo‘q bo‘lsa yaratadi) */
  openCenterChat(center: Center): Promise<string>;
  sendMessage(chatId: string, text: string): Promise<void>;
  markRead(chatId: string): Promise<void>;
  deleteChat(chatId: string): Promise<void>;
  /** Markaz «yozmoqda…» (faqat DEMO simulyatsiya) */
  onTyping?(cb: (chatId: string, typing: boolean) => void): Unsub;

  /** JS xatosini `logs` kolleksiyasiga yozish (faqat Firebase rejimida) */
  logError?(e: import("./errorLog").LogEntry): Promise<void>;
  /** Barcha shaxsiy ma’lumotlarni o‘chirish: "done" — serverda o‘chirildi; "local" — faqat qurilmada edi */
  deleteMyData(): Promise<"done" | "local" | "pending">;

  /** fallback=true — LLM ishlamadi, javob qoidaga asoslangan qidiruvdan */
  askAI(
    query: string,
    history: { from: "user" | "ai"; text: string }[],
    ctx: { centers: Center[]; pos: { lat: number; lng: number } }
  ): Promise<{ text: string; cards: string[]; fallback?: boolean }>;
}

export const centerChatId = (uid: string | number, centerId: string) => `${uid}_${centerId}`;
