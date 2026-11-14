/* Ma’lumot qatlami interfeysi. DEMO — lokal; Firebase — Firestore (+ Functions bo‘lsa auth). */
import type { Application, Center, Chat, Child, Address, Message, Review } from "./types";

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

export interface Backend {
  mode: "demo" | "firebase";
  /** Telegram orqali tasdiqlangan (custom token) foydalanuvchi bormi */
  authed: boolean;
  /** Markaz bilan chat ishlaydimi (auth kerak) */
  centerChatEnabled: boolean;
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

  /** fallback=true — LLM ishlamadi, javob qoidaga asoslangan qidiruvdan */
  askAI(
    query: string,
    history: { from: "user" | "ai"; text: string }[],
    ctx: { centers: Center[]; pos: { lat: number; lng: number } }
  ): Promise<{ text: string; cards: string[]; fallback?: boolean }>;
}

export const centerChatId = (uid: string | number, centerId: string) => `${uid}_${centerId}`;
