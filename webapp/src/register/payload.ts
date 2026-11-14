/* Ro‘yxatdan o‘tish ma’lumoti → bot (Telegram sendData, 4096 bayt chegarasi). Bot tomonda bot/parsers.py: parse_registration. */
import type { Day, Group, LatLng, Teacher } from "../lib/types";

export type Tariff = "oddiy" | "vip";
export const TARIFFS: Record<Tariff, { title: string; price: number; perks: string[] }> = {
  oddiy: {
    title: "Oddiy",
    price: 75000,
    perks: ["Xaritada ko‘rinasiz", "Arizalar Telegram’ga keladi", "Bo‘sh joy va narxni bir bosishda yangilash"]
  },
  vip: {
    title: "VIP",
    price: 145000,
    perks: ["Oddiy tarifdagi hammasi", "Ro‘yxatda birinchi o‘rinda", "Xaritada oltin belgi", "«Tavsiya etilgan» bo‘limida"]
  }
};

export interface Draft {
  tariff: Tariff | null;
  kind: "center" | "tutor";
  name: string;
  phone: string;
  description: string;
  ageFrom: string;
  ageTo: string;
  amenities: string[];
  address: string;
  pos: LatLng | null;
  groups: Group[];
  teachers: Teacher[];
}

export const EMPTY_DRAFT: Draft = {
  tariff: null,
  kind: "center",
  name: "",
  phone: "+998 ",
  description: "",
  ageFrom: "",
  ageTo: "",
  amenities: [],
  address: "",
  pos: null,
  groups: [],
  teachers: []
};

export const MAX_BYTES = 4000;

const age = (v: string) => {
  const n = parseInt(v, 10);
  return n >= 2 && n <= 60 ? n : null;
};

/** Qisqa kalitlar — Telegram sendData 4096 baytga sig‘sin */
export function buildPayload(d: Draft, phone: string): string {
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  return JSON.stringify({
    v: 1,
    t: d.tariff,
    k: d.kind,
    n: d.name.trim(),
    p: phone,
    a: d.address.trim(),
    la: d.pos ? r6(d.pos.lat) : null,
    lo: d.pos ? r6(d.pos.lng) : null,
    d: d.description.trim(),
    af: age(d.ageFrom),
    at: age(d.ageTo),
    am: d.amenities,
    g: d.groups.map((g) => [g.subject, g.days.join(","), g.time, g.price, g.freeSeats]),
    tc: d.kind === "tutor" ? [] : d.teachers.map((x) => [x.name, x.subject, x.experience, x.about])
  });
}

export const byteSize = (s: string) => new TextEncoder().encode(s).length;

export const DAY_FULL: Record<Day, string> = { Du: "Dushanba", Se: "Seshanba", Ch: "Chorshanba", Pa: "Payshanba", Ju: "Juma", Sh: "Shanba", Ya: "Yakshanba" };
