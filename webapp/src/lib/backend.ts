/* Ma’lumot qatlami interfeysi. DEMO — lokal; Firebase — Firestore (+ Functions bo‘lsa auth). */
import type { Application, AppStatus, Center, Chat, Child, Address, Group, Message, Review } from "./types";

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
}

export interface OwnerApi {
  watchMyCenters(cb: (c: OwnerCenter[]) => void): Unsub;
  saveGroups(centerId: string, groups: Group[]): Promise<void>;
  watchCenterApplications(centerId: string, cb: (a: Application[]) => void): Unsub;
  setApplicationStatus(app: Application, status: AppStatus, trialMs: number | null): Promise<void>;
}

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
