/* Telegram bot — faqat Functions ichida (webhook), alohida server yo'q.
 * Vazifasi: markaz/admin kirishini tasdiqlash (/start login_<token>), ilovani yuklab olish havolalari, /help.
 * Ariza va chat xabarlarini markazlarga yuborish — 3-bosqichda (trigger'lar). */
import type { Firestore } from "firebase-admin/firestore";
import { CONTACT, parseStartLogin } from "@yaqindars/shared";
import { confirmLogin, type TgUser } from "./login";

export interface BotConfig {
  token: string;
  androidUrl: string;
  iosUrl: string;
  loginReturnUrl: string;
}

type Button = { text: string; url?: string; callback_data?: string };

export async function tgApi(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!json.ok) console.warn(`Telegram ${method}:`, json.description);
  return json;
}

export function sendMessage(cfg: BotConfig, chatId: number, text: string, buttons?: Button[][]) {
  return tgApi(cfg.token, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {})
  });
}

export function downloadButtons(cfg: BotConfig): Button[][] {
  const rows: Button[][] = [];
  if (cfg.androidUrl) rows.push([{ text: "📲 Android — Google Play", url: cfg.androidUrl }]);
  if (cfg.iosUrl) rows.push([{ text: "🍏 iPhone — App Store", url: cfg.iosUrl }]);
  rows.push([{ text: "🌐 yaqindars.uz", url: CONTACT.site }]);
  rows.push([{ text: "📢 Kanalimiz: @yaqindars", url: `https://t.me/${CONTACT.channel}` }]);
  return rows;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const WELCOME =
  "👋 <b>YaqinDars</b> — uyingizga yaqin o‘quv markazlari va repetitorlar.\n\n" +
  "Endi hammasi <b>mobil ilovada</b>: xarita, bo‘sh joylar, bepul sinov darsiga yozilish, markaz bilan chat.\n\n" +
  "🏫 Markaz yoki repetitormisiz? Ilovada <b>Profil → «Markaz bo‘lib kirish»</b> ni bosing — Telegram orqali bir bosishda kirasiz.";

export const HELP =
  "ℹ️ <b>Yordam</b>\n\n" +
  "• Ota-onalar uchun: ilovani yuklab oling — kirish shart emas.\n" +
  "• Markazlar uchun: ilovada «Markaz bo‘lib kirish» → bu bot ochiladi → tasdiqlang → ilovaga qayting.\n" +
  "• Arizalar haqida xabarlar shu yerga ham keladi.\n\n" +
  `Savol: @${CONTACT.adminTelegram} · ${CONTACT.adminPhone}`;

interface Update {
  message?: { chat: { id: number; type: string }; from?: TgUser; text?: string };
  callback_query?: { id: string; from: TgUser; data?: string; message?: { chat: { id: number } } };
}

/** Bitta Telegram update'ni qayta ishlaydi. Har doim tez qaytadi (Telegram qayta yubormasligi uchun). */
export async function handleUpdate(db: Firestore, cfg: BotConfig, u: Update, now = Date.now()) {
  if (u.callback_query) {
    // Ariza holati tugmalari — 3-bosqichda; hozircha ilovaga yo'naltiramiz
    await tgApi(cfg.token, "answerCallbackQuery", { callback_query_id: u.callback_query.id, text: "Arizalarni ilovadagi kabinetda boshqaring.", show_alert: true });
    return "callback";
  }
  const m = u.message;
  if (!m || m.chat.type !== "private" || !m.from) return "skip";
  const text = (m.text ?? "").trim();
  const token = parseStartLogin(text);
  if (token) {
    const err = await confirmLogin(db, token, m.from, now);
    if (err) {
      await sendMessage(cfg, m.chat.id, `⚠️ ${esc(err)}`);
      return "login-error";
    }
    const name = esc(m.from.first_name ?? "");
    await sendMessage(cfg, m.chat.id, `✅ Tasdiqlandi${name ? `, ${name}` : ""}!\n\nYaqinDars ilovasiga qayting — kirish o‘zi yakunlanadi.`, [
      [{ text: "📱 Ilovaga qaytish", url: cfg.loginReturnUrl }]
    ]);
    return "login-ok";
  }
  if (text.startsWith("/help")) {
    await sendMessage(cfg, m.chat.id, HELP);
    return "help";
  }
  // /start (shu jumladan eski t.me/yaqindars_bot?start=… havolalari) va boshqa matnlar
  await sendMessage(cfg, m.chat.id, WELCOME, downloadButtons(cfg));
  return "welcome";
}
