/* Bepul sinov darsiga ariza: guruh, farzand, ism, telefon, izoh. Telegram ichida — MainButton. */
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SubjectIcon } from "../../components/brand";
import { Button, Chip, SeatChip } from "../../components/ios/controls";
import { spring } from "../../components/ios/motion";
import { Sheet } from "../../components/ios/Sheet";
import { fmtSum, maskPhone, normalizePhone } from "../../lib/format";
import { haptic, inTelegram, tgUser, useMainButton } from "../../lib/telegram";
import type { Center } from "../../lib/types";
import { submitApplication, useApp, useProfile } from "../../store/app";
import { useNav } from "../../store/nav";

const PHONE_KEY = "yd-last-phone";
const readPhone = () => {
  try {
    return localStorage.getItem(PHONE_KEY) || "";
  } catch {
    return "";
  }
};

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string | null }) {
  return (
    <label className="block">
      <span className="mb-1.5 block px-1 text-footnote font-medium text-ink2">{label}</span>
      {children}
      {error && <span className="mt-1 block px-1 text-footnote text-red-text">{error}</span>}
    </label>
  );
}

const inputCls = "h-12 w-full rounded-[12px] bg-card2 px-3.5 text-body text-ink outline-none placeholder:text-ink3 focus:ring-2 focus:ring-tint/40";

export function ApplySheet({ center, groupIndex, open, onClose }: { center: Center; groupIndex: number; open: boolean; onClose: () => void }) {
  const children = useProfile((s) => s.children);
  const showToast = useApp((s) => s.showToast);
  const push = useNav((s) => s.push);

  const [gi, setGi] = useState(groupIndex);
  const [childId, setChildId] = useState<string | null>(children[0]?.id ?? null);
  const [name, setName] = useState(tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") : "");
  const [phone, setPhone] = useState(() => (readPhone() ? maskPhone(readPhone()) : "+998 "));
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setGi(groupIndex);
      setDone(false);
      setTouched(false);
    }
  }, [open, groupIndex]);

  const g = center.groups[gi];
  const phoneOk = normalizePhone(phone);
  const nameOk = name.trim().length >= 2;
  const valid = !!phoneOk && nameOk && !!g;

  const submit = async () => {
    setTouched(true);
    if (!valid || busy) {
      haptic.error();
      return;
    }
    setBusy(true);
    try {
      await submitApplication({ center, groupIndex: gi, name: name.trim(), phone: phoneOk!, childId, comment: comment.trim() });
      try {
        localStorage.setItem(PHONE_KEY, phoneOk!);
      } catch {
        /* private rejim */
      }
      haptic.success();
      setDone(true);
    } catch (e) {
      console.error(e);
      haptic.error();
      showToast("Arizani yuborib bo‘lmadi. Qayta urinib ko‘ring.", "error");
    } finally {
      setBusy(false);
    }
  };

  useMainButton({ visible: open && !done && inTelegram, text: "Arizani yuborish", enabled: !busy, loading: busy, onClick: submit });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={done ? undefined : "Sinov darsiga yozilish"}
      tall={!done}
      footer={
        done ? (
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => {
                onClose();
                push({ name: "applications" }, "profile");
              }}
            >
              Arizalarimni ko‘rish
            </Button>
            <Button kind="plain" className="w-full" onClick={onClose}>
              Yopish
            </Button>
          </div>
        ) : inTelegram ? undefined : (
          <Button kind="green" className="w-full" loading={busy} onClick={submit}>
            Arizani yuborish
          </Button>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center px-8 pb-4 pt-6 text-center">
          <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
            <CheckCircle2 size={72} strokeWidth={1.6} className="text-green" />
          </motion.div>
          <h2 className="mt-4 text-title">Ariza yuborildi</h2>
          <p className="mt-2 text-subhead text-ink2">
            {center.name} tez orada {phoneOk ? "telefon orqali" : ""} bog‘lanadi. Holatini «Arizalarim» bo‘limida kuzatishingiz mumkin.
          </p>
        </div>
      ) : (
        <div className="space-y-5 px-4 pb-4">
          <p className="px-1 text-subhead text-ink2">
            <span className="font-semibold text-ink">{center.name}</span> — birinchi dars bepul. Markaz siz bilan bog‘lanib, vaqtni tasdiqlaydi.
          </p>

          {center.groups.length > 1 && (
            <div role="radiogroup" aria-label="Guruh" className="space-y-2">
              <span className="block px-1 text-footnote font-medium text-ink2">Guruh</span>
              {center.groups.map((x, i) => {
                const active = i === gi;
                return (
                  <button
                    key={i}
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      haptic.selection();
                      setGi(i);
                    }}
                    className={`focus-ring flex w-full items-center gap-3 rounded-[14px] p-3 text-left transition-colors ${active ? "bg-tint/10 ring-2 ring-tint" : "bg-card2"}`}
                  >
                    <SubjectIcon name={x.subject} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-headline">{x.subject}</span>
                      <span className="tnum block truncate text-footnote text-ink2">
                        {x.days.join(", ")} · {x.time} · {fmtSum(x.price)}
                      </span>
                    </span>
                    <SeatChip n={x.freeSeats} compact />
                  </button>
                );
              })}
            </div>
          )}

          {children.length > 0 && (
            <div>
              <span className="mb-1.5 block px-1 text-footnote font-medium text-ink2">Kim uchun?</span>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {children.map((c) => (
                  <Chip key={c.id} active={childId === c.id} onClick={() => setChildId(c.id)}>
                    {c.name}
                    {c.age ? `, ${c.age}` : ""}
                  </Chip>
                ))}
                <Chip active={childId === null} onClick={() => setChildId(null)}>
                  O‘zim uchun
                </Chip>
              </div>
            </div>
          )}

          <Field label="Ismingiz" error={touched && !nameOk ? "Ismingizni kiriting" : null}>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Masalan, Dilshod" autoComplete="name" enterKeyHint="next" />
          </Field>

          <Field label="Telefon raqam" error={touched && !phoneOk ? "Raqam to‘liq emas: +998 XX XXX XX XX" : null}>
            <input
              className={`${inputCls} tnum`}
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+998 90 123 45 67"
            />
          </Field>

          <Field label="Izoh (ixtiyoriy)">
            <textarea
              className={`${inputCls} h-24 resize-none py-3`}
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 300))}
              placeholder="Masalan: farzandim boshlang‘ich darajada"
            />
          </Field>

          {g && g.freeSeats <= 0 && (
            <p className="rounded-[12px] bg-gold-soft p-3 text-footnote text-gold-text">Bu guruhda hozir joy yo‘q — markaz sizni navbatga qo‘yadi yoki boshqa guruh taklif qiladi.</p>
          )}
          <p className="px-1 text-footnote text-ink3">Raqamingiz faqat shu markazga yuboriladi.</p>
        </div>
      )}
    </Sheet>
  );
}
