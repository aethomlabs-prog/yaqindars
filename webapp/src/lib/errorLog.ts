/* JS xatolarini Firestore `logs` kolleksiyasiga yozish (faqat admin o‘qiydi — firestore.rules).
 * Xatolar ilova yuklanishidan oldin ham ushlanadi va backend tayyor bo‘lgach yuboriladi.
 * Bir sessiyada ko‘pi bilan 10 ta, bir xil xabar bir marta. */
import { tg } from "./telegram";

export interface LogEntry {
  source: "web";
  level: "error";
  message: string;
  stack: string;
  screen: string;
  device: string;
  url: string;
}

type Sender = (e: LogEntry) => Promise<void>;

const MAX_PER_SESSION = 10;
const queue: LogEntry[] = [];
const seen = new Set<string>();
let sent = 0;
let sender: Sender | null = null;
let screenFn: () => string = () => "";

export function deviceInfo(): string {
  const tgPart = tg ? `Telegram ${tg.platform ?? "?"} v${tg.version ?? "?"}` : "brauzer";
  return `${tgPart} · ${innerWidth}×${innerHeight} · ${navigator.userAgent}`.slice(0, 300);
}

function push(message: string, stack = "") {
  const key = message.slice(0, 200);
  if (!message || seen.has(key) || sent + queue.length >= MAX_PER_SESSION) return;
  seen.add(key);
  queue.push({
    source: "web",
    level: "error",
    message: message.slice(0, 1000),
    stack: stack.slice(0, 2000),
    screen: screenFn().slice(0, 100),
    device: deviceInfo(),
    url: location.pathname + location.search.replace(/[?&]tgWebApp[^&]*/g, "").slice(0, 200)
  });
  flush();
}

function flush() {
  if (!sender) return;
  while (queue.length) {
    const e = queue.shift()!;
    sent++;
    sender(e).catch(() => {
      /* log yozilmasa — jim (cheksiz siklga tushmaslik uchun) */
    });
  }
}

export function reportError(err: unknown, context = "") {
  const e = err instanceof Error ? err : new Error(String(err));
  push(`${context ? context + ": " : ""}${e.message}`, e.stack ?? "");
}

/** main.tsx’da birinchi bo‘lib chaqiriladi */
export function installErrorLog(getScreen: () => string) {
  screenFn = getScreen;
  addEventListener("error", (ev) => {
    // rasm/skript yuklanmasligi kabi resurs xatolari — ev.error bo‘lmaydi
    if (ev.error || ev.message) push(ev.message || String(ev.error), ev.error?.stack ?? `${ev.filename}:${ev.lineno}:${ev.colno}`);
  });
  addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason;
    push(r instanceof Error ? r.message : String(r), r instanceof Error ? (r.stack ?? "") : "");
  });
}

/** Backend tayyor bo‘lganda (faqat Firebase rejimida) */
export function setLogSender(s: Sender | null) {
  sender = s;
  flush();
}
