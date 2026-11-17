/* Markaz / repetitor posteri (Poster.png uslubi): ko‘k fon, logo, nomi, oq kartochkada QR, @bot.
 * Canvas’da chiziladi — PNG (1080×1080). QR kodi markaz havolasiga: t.me/BOT?startapp=c_<id> */
import qrcode from "qrcode-generator";
import { PIN_PATH } from "../components/brand";

const SIZE = 1080;
const BLUE = "#1E6FD9";
const QR_INK = "#0F3D7A";

function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, width: number, family: string) {
  let size = max;
  for (; size > min; size -= 2) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= width) break;
  }
  return size;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= width || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) {
    lines.length = 2;
    lines[1] = `${lines[1].replace(/\s+\S*$/, "")}…`;
  }
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawLogo(ctx: CanvasRenderingContext2D, x: number, y: number, h: number) {
  const k = h / 120;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = "#fff";
  ctx.fill(new Path2D(PIN_PATH));
  ctx.fillStyle = BLUE;
  ctx.beginPath();
  ctx.arc(50, 46, 27, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.fill(new Path2D("M33 37 Q41 32 49 37.5 L49 58 Q41 53 33 57 Z"));
  ctx.fill(new Path2D("M67 37 Q59 32 51 37.5 L51 58 Q59 53 67 57 Z"));
  ctx.fillStyle = "#22B573";
  ctx.beginPath();
  ctx.arc(80, 16, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTelegram(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BLUE;
  const s = r / 24;
  ctx.beginPath();
  ctx.moveTo(cx - 12 * s, cy + 1 * s);
  ctx.lineTo(cx + 13 * s, cy - 10 * s);
  ctx.lineTo(cx + 8 * s, cy + 12 * s);
  ctx.lineTo(cx + 1 * s, cy + 6 * s);
  ctx.lineTo(cx - 3 * s, cy + 11 * s);
  ctx.lineTo(cx - 3 * s, cy + 4 * s);
  ctx.lineTo(cx + 8 * s, cy - 5 * s);
  ctx.lineTo(cx - 5 * s, cy + 3 * s);
  ctx.closePath();
  ctx.fill();
}

export async function drawPoster(opts: { title: string; subtitle: string; link: string; bot: string }): Promise<string> {
  try {
    await document.fonts?.ready;
  } catch {
    /* shrift kutilmasa ham chizamiz */
  }
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d")!;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Fon va yumshoq dog‘lar
  ctx.fillStyle = BLUE;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  ctx.beginPath();
  ctx.arc(20, 330, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1000, 900, 260, 0, Math.PI * 2);
  ctx.fill();

  // Logo + YaqinDars
  ctx.font = `800 64px ${family}`;
  const brandW = ctx.measureText("YaqinDars").width;
  const logoH = 64;
  const total = (logoH * 100) / 120 + 18 + brandW;
  const x0 = (SIZE - total) / 2;
  drawLogo(ctx, x0, 52, logoH);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText("YaqinDars", x0 + (logoH * 100) / 120 + 18, 106);
  ctx.textAlign = "center";

  // Sarlavha — markaz nomi (1–2 qator)
  const titleSize = fitFont(ctx, opts.title, 800, 66, 44, SIZE - 140, family);
  ctx.font = `800 ${titleSize}px ${family}`;
  const lines = wrap(ctx, opts.title, SIZE - 140);
  let y = 222;
  for (const l of lines) {
    ctx.fillText(l, SIZE / 2, y);
    y += titleSize + 6;
  }
  ctx.font = `500 30px ${family}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(opts.subtitle, SIZE / 2, y + 6);

  // QR kartochka
  const card = 520;
  const cardY = Math.max(y + 40, 300);
  const cx = (SIZE - card) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(9,40,90,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#fff";
  roundRect(ctx, cx, cardY, card, card, 48);
  ctx.fill();
  ctx.restore();

  const qr = qrcode(0, "Q");
  qr.addData(opts.link);
  qr.make();
  const n = qr.getModuleCount();
  const pad = 48;
  const cell = Math.floor((card - pad * 2) / n);
  const qrSize = cell * n;
  const qx = cx + (card - qrSize) / 2;
  const qy = cardY + (card - qrSize) / 2;
  ctx.fillStyle = QR_INK;
  for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) ctx.fillRect(qx + col * cell, qy + r * cell, cell, cell);

  // @bot
  const handle = `@${opts.bot}`;
  const hy = cardY + card + 110;
  const hSize = fitFont(ctx, handle, 800, 76, 48, SIZE - 260, family);
  ctx.font = `800 ${hSize}px ${family}`;
  const hw = ctx.measureText(handle).width;
  const icon = hSize * 0.55;
  const startX = (SIZE - (hw + icon * 2 + 24)) / 2;
  drawTelegram(ctx, startX + icon, hy - hSize * 0.34, icon);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.fillText(handle, startX + icon * 2 + 24, hy);
  ctx.textAlign = "center";

  ctx.font = `500 34px ${family}`;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText("Skanerlang — bepul sinov darsiga yoziling", SIZE / 2, SIZE - 50);

  return c.toDataURL("image/png");
}
