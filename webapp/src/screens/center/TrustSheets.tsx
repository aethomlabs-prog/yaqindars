/* Ishonch: «✓ Tasdiqlangan» izohi va «Ma’lumot noto‘g‘ri» shikoyati */
import { BadgeCheck, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "../../components/ios/controls";
import { Sheet } from "../../components/ios/Sheet";
import { REPORT_REASONS, type ReportReason } from "../../lib/backend";
import { fmtDate } from "../../lib/format";
import { haptic } from "../../lib/telegram";
import type { Center } from "../../lib/types";
import { useApp } from "../../store/app";

export function VerifiedBadge({ large, onClick }: { large?: boolean; onClick?: () => void }) {
  const cls = `inline-flex shrink-0 items-center gap-1 rounded-full bg-green-soft font-semibold text-green-text ${large ? "px-2.5 py-1 text-footnote" : "px-1.5 py-px text-caption"}`;
  const body = (
    <>
      <BadgeCheck size={large ? 15 : 12} aria-hidden /> Tasdiqlangan
    </>
  );
  return onClick ? (
    <button className={`focus-ring ${cls}`} onClick={onClick} aria-label="Tasdiqlangan — bu nimani anglatadi?">
      {body}
    </button>
  ) : (
    <span className={cls} title="YaqinDars jamoasi tekshirgan">
      {body}
    </span>
  );
}

export function VerifiedSheet({ center, open, onClose }: { center: Center; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Tasdiqlangan markaz">
      <div className="px-5 pb-6">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-soft text-green-text" aria-hidden>
          <BadgeCheck size={30} />
        </div>
        <p className="text-center text-body">YaqinDars jamoasi bu markazni tekshirgan:</p>
        <ul className="mt-3 space-y-2 text-subhead">
          {["Manzil xaritadagi joyga mos", "Telefon raqami ishlaydi va markazga tegishli", "Markaz haqiqatan faoliyat yuritmoqda"].map((t) => (
            <li key={t} className="flex gap-2">
              <Check size={18} className="mt-0.5 shrink-0 text-green-text" aria-hidden /> {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-footnote text-ink2">
          {center.verifiedMs ? `Tekshirilgan sana: ${fmtDate(center.verifiedMs)}. ` : ""}
          Narx va bo‘sh joylarni markazning o‘zi yangilaydi — noto‘g‘ri bo‘lsa, sahifa oxiridagi «Ma’lumot noto‘g‘ri» orqali xabar bering.
        </p>
      </div>
    </Sheet>
  );
}

export function ReportSheet({ center, open, onClose }: { center: Center; open: boolean; onClose: () => void }) {
  const backend = useApp((s) => s.backend);
  const showToast = useApp((s) => s.showToast);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!reason) return;
    if (!backend?.authed) {
      showToast("Bu funksiya Telegram ichida ishlaydi.", "info");
      return;
    }
    setBusy(true);
    try {
      await backend.reportCenter(center, reason, comment.trim());
      haptic.success();
      showToast("Rahmat! Admin tekshirib, ma’lumotni to‘g‘rilaydi", "ok");
      setReason(null);
      setComment("");
      onClose();
    } catch {
      showToast("Bugun bu markaz haqida xabar yuborgansiz yoki internet yo‘q", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ma’lumot noto‘g‘ri"
      footer={
        <Button className="w-full" disabled={!reason} loading={busy} onClick={send}>
          Adminga yuborish
        </Button>
      }
    >
      <div className="px-4 pb-2">
        <p className="mb-3 text-center text-subhead text-ink2">Nima noto‘g‘ri? Admin tekshirib, to‘g‘rilaydi.</p>
        <div className="overflow-hidden rounded-card bg-card" role="radiogroup" aria-label="Sabab">
          {(Object.keys(REPORT_REASONS) as ReportReason[]).map((k) => (
            <button
              key={k}
              role="radio"
              aria-checked={reason === k}
              onClick={() => (haptic.selection(), setReason(k))}
              className="focus-ring flex min-h-[48px] w-full items-center justify-between px-4 text-left text-body [box-shadow:inset_0_-0.5px_0_var(--sep)] last:shadow-none active:bg-fill"
            >
              {REPORT_REASONS[k]}
              {reason === k && <Check size={20} className="text-tint" aria-hidden />}
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Izoh (ixtiyoriy): masalan, haqiqiy narx 300 000"
          className="mt-3 w-full resize-none rounded-[14px] bg-card2 px-4 py-3 text-body outline-none focus:ring-2 focus:ring-tint/40"
          aria-label="Izoh"
        />
      </div>
    </Sheet>
  );
}
