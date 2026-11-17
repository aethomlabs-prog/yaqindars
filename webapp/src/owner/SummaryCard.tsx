/* Kabinet oxiridagi xulosa: qisqa natijalar + o‘z QR posteri (Poster.png uslubi), yuklab olish / Telegram’ga yuborish / ulashish. */
import { Copy, Download, QrCode, Send, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ios/controls";
import type { OwnerCenter } from "../lib/backend";
import { billingOf } from "../lib/billing";
import { fmtDate } from "../lib/format";
import { haptic, inTelegram, openTelegramLink } from "../lib/telegram";
import type { Application } from "../lib/types";
import { useApp, useBotUsername } from "../store/app";

export function SummaryCard({ c, apps }: { c: OwnerCenter; apps: Application[] }) {
  const owner = useApp((s) => s.backend?.owner);
  const showToast = useApp((s) => s.showToast);
  const bot = useBotUsername() || "yaqindars_bot";
  const [poster, setPoster] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const name = c.name.replace(/^Namuna:\s*/, "");
  const link = `https://t.me/${bot}?startapp=c_${c.id}`;
  const tutor = c.kind === "tutor";

  useEffect(() => {
    let alive = true;
    setPoster(null);
    import("./poster")
      .then(({ drawPoster }) => drawPoster({ title: name, subtitle: tutor ? "Repetitor · bepul sinov darsi" : "O‘quv markazi · bepul sinov darsi", link, bot }))
      .then((url) => alive && setPoster(url))
      .catch((e) => console.warn("poster:", e));
    return () => {
      alive = false;
    };
  }, [name, link, bot, tutor]);

  const b = billingOf(c);
  const accepted = apps.filter((a) => a.status === "accepted").length;
  const fresh = apps.filter((a) => a.status === "new").length;
  const seats = c.groups.reduce((s, g) => s + g.freeSeats, 0);
  const rate = apps.length ? Math.round((accepted / apps.length) * 100) : null;
  const status = c.hidden ? "xaritadan yashirilgan" : !c.approved ? "admin tekshiruvida" : b.state === "trial" ? `bepul davr, ${b.days} kun qoldi` : b.state === "active" ? `${fmtDate(b.until)} gacha faol` : "to‘lov muddati o‘tgan";

  const download = () => {
    if (!poster) return;
    const a = document.createElement("a");
    a.href = poster;
    a.download = `yaqindars-${c.id.slice(0, 8)}.png`;
    a.click();
  };
  const sendToTelegram = async () => {
    if (!owner) return;
    setSending(true);
    try {
      await owner.requestQr(c.id);
      haptic.success();
      showToast("Poster botga yuborildi — Telegram chatida PNG fayl", "ok");
    } catch {
      showToast("Yuborib bo‘lmadi. Botda /qr yozing.", "error");
    } finally {
      setSending(false);
    }
  };
  const copy = () =>
    navigator.clipboard
      ?.writeText(link)
      .then(() => (haptic.light(), showToast("Havola nusxalandi", "ok")))
      .catch(() => showToast("Nusxalab bo‘lmadi", "error"));
  const share = () => openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`${name} — bepul sinov darsiga yoziling`)}`);

  return (
    <section className="mx-4 mt-6 rounded-card bg-card p-4 shadow-card" aria-labelledby="summary-h">
      <h2 id="summary-h" className="flex items-center gap-2 text-headline">
        <QrCode size={18} className="text-tint" aria-hidden /> Xulosa
      </h2>
      <p className="mt-1 text-subhead text-ink2">
        {tutor ? "Profilingiz" : "Markazingiz"}: {status}. {apps.length ? `Jami ${apps.length} ta ariza, ${accepted} tasi qabul qilingan${rate !== null ? ` (${rate}%)` : ""}.` : "Hali ariza yo‘q."}{" "}
        {fresh ? `${fresh} ta yangi ariza javob kutmoqda.` : ""} {seats ? `Bo‘sh joy: ${seats} ta.` : "Bo‘sh joy qolmagan — ota-onalar ariza qoldira olmaydi."}
      </p>

      <div className="mx-auto mt-4 aspect-square w-full max-w-[360px] overflow-hidden rounded-[18px] bg-[#1E6FD9]">
        {poster ? <img src={poster} alt={`${name} — QR poster`} className="h-full w-full" /> : <div className="h-full w-full animate-pulse bg-white/10" aria-hidden />}
      </div>
      <p className="mt-2 text-center text-footnote text-ink2">Eshikka, e’lonlarga va ijtimoiy tarmoqlarga joylang — skanerlagan ota-ona to‘g‘ri sizning sahifangizga tushadi.</p>

      <div className="mt-3 flex flex-col gap-2">
        {inTelegram ? (
          <Button size="md" className="w-full" loading={sending} disabled={!owner} onClick={sendToTelegram}>
            <Send size={17} aria-hidden /> Posterni Telegram’ga olish (PNG)
          </Button>
        ) : (
          <Button size="md" className="w-full" disabled={!poster} onClick={download}>
            <Download size={17} aria-hidden /> Posterni yuklab olish (PNG)
          </Button>
        )}
        <div className="flex gap-2">
          <Button kind="tinted" size="md" className="flex-1" onClick={copy}>
            <Copy size={17} aria-hidden /> Havola
          </Button>
          <Button kind="tinted" size="md" className="flex-1" onClick={share}>
            <Share size={17} aria-hidden /> Ulashish
          </Button>
        </div>
      </div>
    </section>
  );
}
