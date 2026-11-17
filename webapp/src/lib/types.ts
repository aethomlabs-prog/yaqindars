export type Day = "Du" | "Se" | "Ch" | "Pa" | "Ju" | "Sh" | "Ya";
export const DAYS: Day[] = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

export interface Group {
  subject: string;
  days: Day[];
  time: string; // "16:00–17:30"
  price: number;
  freeSeats: number;
}

export interface Teacher {
  name: string;
  subject: string;
  /** tajriba, yil */
  experience: number | null;
  about: string;
}

export interface Center {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string;
  amenities: string[];
  vip: boolean;
  rating: number | null;
  reviewsCount: number;
  description: string;
  ageFrom: number | null;
  ageTo: number | null;
  photoUrl: string | null;
  kind: "center" | "tutor";
  groups: Group[];
  teachers: Teacher[];
  updatedMs: number;
  /** false — admin qo‘shgan, egasi hali yo‘q («Ma’lumot tasdiqlanmagan») */
  claimed: boolean;
  /** «✓ Tasdiqlangan»: admin manzil, telefon va faoliyatni tekshirgan */
  verified: boolean;
  verifiedMs: number | null;
  /** markaz rasmlari soni (0–5); rasmlar sahifa ochilganda alohida yuklanadi */
  photoCount: number;
}

export type AppStatus = "new" | "seen" | "accepted" | "rejected";

export interface Application {
  id: string;
  centerId: string;
  centerName: string;
  group: string;
  groupIndex: number;
  name: string;
  phone: string;
  childId: string | null;
  comment: string;
  status: AppStatus;
  createdMs: number;
  trialMs: number | null;
}

export interface Child {
  id: string;
  name: string;
  age: number | null;
  grade: string;
  interests: string[];
}

export interface Address {
  id: string;
  label: string;
  text: string;
  lat: number;
  lng: number;
}

export type MsgFrom = "user" | "center" | "ai" | "system";

export interface Message {
  id: string;
  from: MsgFrom;
  text: string;
  cards?: string[];
  createdMs: number;
}

export interface Chat {
  id: string;
  type: "center" | "ai";
  centerId: string | null;
  title: string;
  lastMessage: string;
  lastMs: number;
  unread: number;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  createdMs: number;
}

/** Saqlangan qidiruv: «Shunday joy ochilsa xabar ber» */
export interface Watch {
  id: string;
  subject: string | null;
  radiusKm: number | null;
  maxPrice: number | null;
  days: Day[];
  lat: number;
  lng: number;
  createdMs: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}
