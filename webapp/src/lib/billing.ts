/* Obuna holati: bepul sinov oyi → to‘langan muddat → muddati o‘tgan.
 * To‘lov hozircha admin orqali (Telegram). Admin «To‘lov qabul qilindi» bosganda paidUntil uzayadi. */
import { TRIAL_DAYS, tariffPrice } from "../../config";

const DAY = 86400000;

export type BillingState = "pending" | "trial" | "active" | "overdue";

export interface Billing {
  state: BillingState;
  tariff: "oddiy" | "vip";
  price: number;
  /** sinov yoki to‘langan muddat tugaydigan vaqt */
  until: number;
  /** qolgan kunlar (muddati o‘tgan bo‘lsa — o‘tgan kunlar, manfiy emas) */
  days: number;
}

export function billingOf(
  c: { approved: boolean; vip: boolean; kind?: "center" | "tutor"; tariff: "oddiy" | "vip" | null; createdMs: number; paidUntilMs: number | null; claimedMs?: number | null },
  now = Date.now()
): Billing {
  const tariff = c.vip || c.tariff === "vip" ? "vip" : "oddiy";
  const price = tariffPrice(c.kind ?? "center", tariff);
  // Admin qo‘shgan markaz: bepul oy egasi egallagan kundan boshlanadi
  const trialEnd = (c.claimedMs || c.createdMs || now) + TRIAL_DAYS * DAY;
  const until = Math.max(trialEnd, c.paidUntilMs ?? 0);
  const days = Math.max(0, Math.ceil(Math.abs(until - now) / DAY));
  if (!c.approved) return { state: "pending", tariff, price, until: trialEnd, days: TRIAL_DAYS };
  if (now < until) return { state: (c.paidUntilMs ?? 0) > trialEnd ? "active" : "trial", tariff, price, until, days };
  return { state: "overdue", tariff, price, until, days };
}

/** To‘lovdan keyingi yangi muddat: hozirgi muddat (yoki bugun) + months × 30 kun */
export function extendUntil(b: Billing, months: number, now = Date.now()) {
  return Math.max(now, b.until) + months * 30 * DAY;
}
