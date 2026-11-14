/* Markaz / repetitorni ro‘yxatdan o‘tkazish (bot: /markaz → «Markazni qo‘shish»).
 * Qadamlar: Tarif → Ma’lumot → Joylashuv → Guruhlar → O‘qituvchilar → Tekshirish.
 * Ma’lumot Telegram.WebApp.sendData orqali botga ketadi, bot tekshirib Firestore’ga yozadi. */
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, ChevronLeft, Clock, GraduationCap, MapPin, Minus, Pencil, Plus, Trash2, Users } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { LogoMark, SubjectIcon } from "../components/brand";
import { Avatar, Button, Chip, Segmented } from "../components/ios/controls";
import { spring } from "../components/ios/motion";
import { Sheet } from "../components/ios/Sheet";
import { Toast } from "../components/ios/Toast";
import { Spinner } from "../components/ios/Spinner";
import { fmtSum, maskPhone, normalizePhone } from "../lib/format";
import { RISHTON } from "../lib/geo";
import { SUBJECTS } from "../lib/match";
import { haptic, inTelegram, tg, tgUser, useBackHandler, useMainButton } from "../lib/telegram";
import { DAYS, type Day, type Group, type Teacher } from "../lib/types";
import { useApp } from "../store/app";
import { buildPayload, byteSize, DAY_FULL, EMPTY_DRAFT, MAX_BYTES, TARIFFS, type Draft, type Tariff } from "./payload";

const MapPicker = lazy(() => import("../screens/map/MapPicker"));
const KEY = "yd-register-draft";
const AMENITIES = ["Wi-Fi", "Konditsioner", "Kompyuter xonasi", "Kutubxona", "Kuzatuv kamerasi", "Kutish zali", "Avtoturargoh", "Onlayn dars", "Uyda dars"];
const PRICE_PRESETS = [150000, 200000, 250000, 300000, 400000];

const input = "h-12 w-full rounded-[12px] bg-card px-3.5 text-body text-ink outline-none shadow-card placeholder:text-ink3 focus:ring-2 focus:ring-tint/40";

function loadDraft(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null");
    if (d && typeof d === "object") return { ...EMPTY_DRAFT, ...d };
  } catch {
    /* bo‘sh */
  }
  return { ...EMPTY_DRAFT, name: "", phone: "+998 " };
}

/* ---------- Kichik bloklar ---------- */
function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 px-1">
      <span className="text-subhead font-semibold">{children}</span>
      {hint && <span className="ml-1.5 text-footnote text-ink3">{hint}</span>}
    </div>
  );
}

function Err({ show, children }: { show: boolean; children: ReactNode }) {
  return show ? <p className="mt-1 px-1 text-footnote text-red-text">{children}</p> : null;
}

function Stepper({ value, onChange, min, max, suffix }: { value: number; onChange: (n: number) => void; min: number; max: number; suffix?: string }) {
  const b = "focus-ring pressable flex h-11 w-11 items-center justify-center rounded-full bg-fill text-tint disabled:opacity-30";
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Kamaytirish" className={b} disabled={value <= min} onClick={() => (haptic.selection(), onChange(value - 1))}>
        <Minus size={20} />
      </button>
      <span className="tnum min-w-[64px] text-center text-title">
        {value}
        {suffix && <span className="ml-1 text-subhead font-normal text-ink2">{suffix}</span>}
      </span>
      <button type="button" aria-label="Ko‘paytirish" className={b} disabled={value >= max} onClick={() => (haptic.selection(), onChange(value + 1))}>
        <Plus size={20} />
      </button>
    </div>
  );
}

const fmtPriceInput = (n: number) => (n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "");

/* ---------- Guruh muharriri ---------- */
function GroupSheet({ open, initial, onSave, onClose }: { open: boolean; initial: Group | null; onSave: (g: Group) => void; onClose: () => void }) {
  const [g, setG] = useState<Group>(initial ?? { subject: "", days: [], time: "16:00–17:30", price: 0, freeSeats: 5 });
  const [custom, setCustom] = useState(initial && !SUBJECTS.includes(initial.subject) ? initial.subject : "");
  const [tried, setTried] = useState(false);
  const [start, end] = g.time.split("–");
  const timeOk = !!start && !!end && end > start;
  const subject = g.subject === "Boshqa" ? custom.trim() : g.subject;
  const valid = subject.length >= 2 && g.days.length > 0 && timeOk && g.price >= 10000 && g.price <= 10000000;

  const save = () => {
    setTried(true);
    if (!valid) return haptic.error();
    haptic.success();
    onSave({ ...g, subject });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={initial ? "Guruhni tahrirlash" : "Yangi guruh"}
      left={
        <button onClick={onClose} className="h-11 px-1 text-body text-tint">
          Bekor
        </button>
      }
      footer={
        <Button className="w-full" onClick={save}>
          Guruhni saqlash
        </Button>
      }
    >
      <div className="space-y-6 px-4 pb-4">
        <div>
          <Label>Fan</Label>
          <div className="grid grid-cols-2 gap-2">
            {SUBJECTS.map((s) => {
              const on = g.subject === s || (s === "Boshqa" && g.subject === "Boshqa");
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (haptic.selection(), setG({ ...g, subject: s }))}
                  className={`focus-ring flex items-center gap-2.5 rounded-[14px] p-2 text-left transition-colors ${on ? "bg-tint/10 ring-2 ring-tint" : "bg-card2"}`}
                >
                  <SubjectIcon name={s} size={34} />
                  <span className="truncate text-subhead font-medium">{s === "Boshqa" ? "Boshqa…" : s}</span>
                </button>
              );
            })}
          </div>
          {g.subject === "Boshqa" && (
            <input className={`${input} mt-2 !bg-card2 !shadow-none`} value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 40))} placeholder="Fan nomi, masalan: Koreys tili" autoFocus />
          )}
          <Err show={tried && subject.length < 2}>Fanni tanlang</Err>
        </div>

        <div>
          <Label>Dars kunlari</Label>
          <div className="flex gap-1.5">
            {DAYS.map((d) => {
              const on = g.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_FULL[d]}
                  onClick={() => (haptic.selection(), setG({ ...g, days: on ? g.days.filter((x) => x !== d) : DAYS.filter((x) => x === d || g.days.includes(x)) }))}
                  className={`focus-ring h-12 flex-1 rounded-[12px] text-subhead font-semibold transition-colors ${on ? "bg-tint text-white" : "bg-card2 text-ink"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            {[
              { l: "Du-Ch-Ju", d: ["Du", "Ch", "Ju"] as Day[] },
              { l: "Se-Pa-Sh", d: ["Se", "Pa", "Sh"] as Day[] },
              { l: "Har kuni", d: ["Du", "Se", "Ch", "Pa", "Ju", "Sh"] as Day[] }
            ].map((x) => (
              <button key={x.l} type="button" onClick={() => setG({ ...g, days: x.d })} className="rounded-full bg-tint/10 px-3 py-1.5 text-footnote font-medium text-tint">
                {x.l}
              </button>
            ))}
          </div>
          <Err show={tried && !g.days.length}>Kamida bitta kunni tanlang</Err>
        </div>

        <div>
          <Label>Vaqti</Label>
          <div className="flex items-center gap-2">
            <input type="time" aria-label="Boshlanishi" className={`${input} tnum !bg-card2 !shadow-none`} value={start} onChange={(e) => setG({ ...g, time: `${e.target.value}–${end}` })} />
            <span className="text-ink3">—</span>
            <input type="time" aria-label="Tugashi" className={`${input} tnum !bg-card2 !shadow-none`} value={end} onChange={(e) => setG({ ...g, time: `${start}–${e.target.value}` })} />
          </div>
          <Err show={tried && !timeOk}>Tugash vaqti boshlanishidan keyin bo‘lsin</Err>
        </div>

        <div>
          <Label hint="so‘m">Oylik narx</Label>
          <input
            className={`${input} tnum !bg-card2 !shadow-none`}
            inputMode="numeric"
            placeholder="250 000"
            value={fmtPriceInput(g.price)}
            onChange={(e) => setG({ ...g, price: Math.min(10000000, Number(e.target.value.replace(/\D/g, "")) || 0) })}
          />
          <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
            {PRICE_PRESETS.map((p) => (
              <Chip key={p} active={g.price === p} onClick={() => setG({ ...g, price: p })}>
                {p / 1000} ming
              </Chip>
            ))}
          </div>
          <Err show={tried && (g.price < 10000 || g.price > 10000000)}>Narxni kiriting (10 000 so‘mdan)</Err>
        </div>

        <div className="flex items-center justify-between rounded-card bg-card2 p-4">
          <div>
            <div className="text-body font-medium">Bo‘sh joylar</div>
            <div className="text-footnote text-ink2">Keyin botda ➖/➕ bilan o‘zgartirasiz</div>
          </div>
          <Stepper value={g.freeSeats} min={0} max={100} onChange={(n) => setG({ ...g, freeSeats: n })} />
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- O‘qituvchi muharriri ---------- */
function TeacherSheet({ open, initial, subjects, onSave, onClose }: { open: boolean; initial: Teacher | null; subjects: string[]; onSave: (t: Teacher) => void; onClose: () => void }) {
  const [t, setT] = useState<Teacher>(initial ?? { name: "", subject: subjects[0] ?? "", experience: 3, about: "" });
  const [tried, setTried] = useState(false);
  const valid = t.name.trim().length >= 3 && t.subject.trim().length >= 2;
  const save = () => {
    setTried(true);
    if (!valid) return haptic.error();
    haptic.success();
    onSave({ ...t, name: t.name.trim(), subject: t.subject.trim(), about: t.about.trim() });
  };
  const options = [...new Set([...subjects, ...SUBJECTS.filter((s) => s !== "Boshqa")])];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={initial ? "O‘qituvchini tahrirlash" : "Yangi o‘qituvchi"}
      left={
        <button onClick={onClose} className="h-11 px-1 text-body text-tint">
          Bekor
        </button>
      }
      footer={
        <Button className="w-full" onClick={save}>
          Saqlash
        </Button>
      }
    >
      <div className="space-y-6 px-4 pb-4">
        <div className="flex justify-center">
          <Avatar name={t.name || "?"} size={72} />
        </div>
        <div>
          <Label>Ism va familiya</Label>
          <input className={`${input} !bg-card2 !shadow-none`} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value.slice(0, 60) })} placeholder="Masalan, Nilufar Rahimova" autoFocus={!initial} />
          <Err show={tried && t.name.trim().length < 3}>Ismni kiriting</Err>
        </div>
        <div>
          <Label>Fani</Label>
          <div className="flex flex-wrap gap-2">
            {options.map((s) => (
              <Chip key={s} active={t.subject === s} onClick={() => setT({ ...t, subject: s })}>
                {s}
              </Chip>
            ))}
          </div>
          <Err show={tried && t.subject.trim().length < 2}>Fanni tanlang</Err>
        </div>
        <div className="flex items-center justify-between rounded-card bg-card2 p-4">
          <div className="text-body font-medium">Tajribasi</div>
          <Stepper value={t.experience ?? 0} min={0} max={50} suffix="yil" onChange={(n) => setT({ ...t, experience: n })} />
        </div>
        <div>
          <Label hint="ixtiyoriy">Qisqacha</Label>
          <input className={`${input} !bg-card2 !shadow-none`} value={t.about} onChange={(e) => setT({ ...t, about: e.target.value.slice(0, 80) })} placeholder="Masalan: IELTS 8.0, CELTA sertifikati" />
        </div>
      </div>
    </Sheet>
  );
}

/** Ro‘yxatdan o‘tish rejimidan asosiy web app’ga (xarita, markazlar) */
function goMainApp() {
  const u = new URL(location.href);
  u.searchParams.delete("mode");
  location.replace(u.toString());
}

/* ---------- Asosiy oqim ---------- */
type StepId = "tariff" | "info" | "location" | "groups" | "teachers" | "review";
const TITLES: Record<StepId, string> = {
  tariff: "Tarifni tanlang",
  info: "Asosiy ma’lumot",
  location: "Joylashuv",
  groups: "Guruhlar",
  teachers: "O‘qituvchilar",
  review: "Tekshirish"
};

export default function RegisterApp() {
  const [d, setD] = useState<Draft>(loadDraft);
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [tried, setTried] = useState(false);
  const [groupEdit, setGroupEdit] = useState<{ open: boolean; idx: number | null; key: number }>({ open: false, idx: null, key: 0 });
  const [teacherEdit, setTeacherEdit] = useState<{ open: boolean; idx: number | null; key: number }>({ open: false, idx: null, key: 0 });
  const [picked, setPicked] = useState(!!d.pos);
  const [sent, setSent] = useState(false);
  const userPos = useApp((s) => s.userPos);
  const locate = useApp((s) => s.locate);
  const showToast = useApp((s) => s.showToast);

  const steps: StepId[] = d.kind === "tutor" ? ["tariff", "info", "location", "groups", "review"] : ["tariff", "info", "location", "groups", "teachers", "review"];
  const step = steps[Math.min(i, steps.length - 1)];
  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  // Qoralama avtomatik saqlanadi — ilova yopilsa ham yo‘qolmaydi
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      /* private rejim */
    }
  }, [d]);

  // Joylashuv qadamida GPS’ni bir marta so‘raymiz
  useEffect(() => {
    if (step === "location" && !picked && !userPos) locate(false);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const phone = normalizePhone(d.phone);
  const payload = useMemo(() => buildPayload(d, phone ?? ""), [d, phone]);
  const bytes = byteSize(payload);

  const problems: Record<StepId, string | null> = {
    tariff: d.tariff ? null : "Tarifni tanlang",
    info: d.name.trim().length < 2 ? "Nomini kiriting" : !phone ? "Telefon raqamini to‘liq kiriting" : null,
    location: !d.pos || (!picked && !userPos) ? "Pinni xaritada aniq joyga qo‘ying" : d.address.trim().length < 3 ? "Manzilni yozing" : null,
    groups: d.groups.length ? null : "Kamida bitta guruh qo‘shing",
    teachers: null,
    review: bytes > MAX_BYTES ? "Ma’lumot juda uzun — tavsif yoki izohlarni qisqartiring" : null
  };

  const go = (to: number) => {
    setDir(to > i ? 1 : -1);
    setI(to);
    setTried(false);
    document.getElementById("reg-scroll")?.scrollTo({ top: 0 });
  };

  const submit = () => {
    const bad = steps.find((s) => problems[s]);
    if (bad) {
      showToast(problems[bad]!, "error");
      return go(steps.indexOf(bad));
    }
    haptic.success();
    // sendData faqat pastdagi klaviatura tugmasidan ochilganda ishlaydi (inline/menyu tugmasida query_id bo‘ladi)
    if (inTelegram && tg?.sendData && !tg.initDataUnsafe?.query_id) {
      try {
        localStorage.removeItem(KEY); // qoralama faqat haqiqatan yuborilganda o‘chadi
      } catch {
        /* private rejim */
      }
      tg.sendData(payload); // Telegram Mini App’ni o‘zi yopadi, bot javob yozadi
    } else {
      setSent(true);
    }
  };

  const next = () => {
    setTried(true);
    if (problems[step]) {
      haptic.error();
      return;
    }
    if (step === "review") return submit();
    haptic.light();
    go(i + 1);
  };

  useBackHandler(i > 0 && !sent, () => go(i - 1));
  const nextText = step === "review" ? "Yuborish" : step === "teachers" && !d.teachers.length ? "Keyinroq qo‘shaman" : "Davom etish";
  useMainButton({ visible: inTelegram && !sent, text: nextText, onClick: next });

  if (sent)
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center" style={{ height: "var(--vh)" }}>
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
          <CheckCircle2 size={76} strokeWidth={1.5} className="text-green" />
        </motion.div>
        <h1 className="mt-4 text-title">{inTelegram ? "Deyarli tayyor" : "Ma’lumotlar tayyor"}</h1>
        <p className="mt-2 text-subhead text-ink2">
          {inTelegram
            ? "Yuborish uchun botda /markaz yozing va pastdagi «📝 Markazni qo‘shish» tugmasini bosing — kiritganlaringiz saqlangan, faqat «Yuborish»ni bosasiz."
            : "Bu namuna rejimi: Telegram’da botning /markaz buyrug‘i orqali ochilganda ma’lumot botga yuboriladi va admin tekshiradi."}
        </p>
        <div className="mt-6 w-full max-w-[320px] space-y-2">
          <Button className="w-full" onClick={goMainApp}>
            Ilovaga o‘tish
          </Button>
          {inTelegram && (
            <Button kind="plain" className="w-full" onClick={() => tg?.close?.()}>
              Botga qaytish
            </Button>
          )}
        </div>
      </div>
    );

  const groupSubjects = [...new Set(d.groups.map((g) => g.subject))];

  return (
    <div className="flex flex-col bg-bg" style={{ height: "var(--vh)" }}>
      {/* Sarlavha + progress */}
      <header className="shrink-0 px-4" style={{ paddingTop: "calc(8px + var(--safe-top))" }}>
        <div className="flex h-11 items-center gap-2">
          {i > 0 ? (
            <button onClick={() => go(i - 1)} className="focus-ring -ml-2 flex h-11 items-center pr-2 text-tint" aria-label="Orqaga">
              <ChevronLeft size={28} strokeWidth={2.2} />
              <span className="text-body">Orqaga</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <LogoMark size={26} />
              <span className="text-headline">YaqinDars · Markazlar uchun</span>
            </div>
          )}
          <span className="tnum ml-auto text-footnote text-ink2">
            {i + 1}/{steps.length}
          </span>
        </div>
        <div className="mt-1 flex gap-1" aria-hidden>
          {steps.map((s, k) => (
            <span key={s} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${k <= i ? "bg-tint" : "bg-fill"}`} />
          ))}
        </div>
        <h1 className="mt-4 text-large-title">{TITLES[step]}</h1>
      </header>

      <div id="reg-scroll" className="scroll-y no-scrollbar relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.2 }}
            className="px-4 pb-6 pt-3"
          >
            {step === "tariff" && (
              <div className="space-y-4">
                <p className="px-1 text-subhead text-ink2">Birinchi oy — bepul. To‘lov admin tasdiqlagandan keyin, ikkinchi oydan boshlanadi.</p>
                <Segmented
                  label="Turi"
                  value={d.kind}
                  onChange={(k) => patch({ kind: k })}
                  options={[
                    { value: "center", label: "O‘quv markazi" },
                    { value: "tutor", label: "Repetitor" }
                  ]}
                />
                <div role="radiogroup" aria-label="Tarif" className="space-y-3">
                  {(Object.keys(TARIFFS) as Tariff[]).map((k) => {
                    const t = TARIFFS[k];
                    const on = d.tariff === k;
                    return (
                      <button
                        key={k}
                        role="radio"
                        aria-checked={on}
                        onClick={() => (haptic.selection(), patch({ tariff: k }))}
                        className={`focus-ring block w-full rounded-card bg-card p-5 text-left transition-shadow ${on ? "shadow-[0_0_0_2px_var(--tint)]" : "shadow-card"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-title">{t.title}</span>
                              {k === "vip" && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-caption font-semibold text-gold-text">Ko‘proq o‘quvchi</span>}
                            </div>
                            <div className="tnum mt-1 text-headline">
                              {fmtSum(t.price)}
                              <span className="font-normal text-ink2"> / oy</span>
                            </div>
                          </div>
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${on ? "bg-tint text-white" : "shadow-[inset_0_0_0_2px_var(--ink3)]"}`} aria-hidden>
                            {on && <Check size={17} strokeWidth={3} />}
                          </span>
                        </div>
                        <ul className="mt-4 space-y-2">
                          {t.perks.map((p) => (
                            <li key={p} className="flex items-center gap-2.5 text-subhead">
                              <Check size={17} strokeWidth={2.6} className="shrink-0 text-green" aria-hidden />
                              {p}
                            </li>
                          ))}
                        </ul>
                      </button>
                    );
                  })}
                </div>
                <Err show={tried && !d.tariff}>Tarifni tanlang</Err>
              </div>
            )}

            {step === "info" && (
              <div className="space-y-5">
                <div>
                  <Label>{d.kind === "tutor" ? "Ism va familiyangiz" : "Markaz nomi"}</Label>
                  <input
                    className={input}
                    value={d.name}
                    onChange={(e) => patch({ name: e.target.value.slice(0, 80) })}
                    placeholder={d.kind === "tutor" ? (tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") : "Masalan, Dilnoza Karimova") : "Masalan, «Bilimdon» o‘quv markazi"}
                  />
                  <Err show={tried && d.name.trim().length < 2}>Nomini kiriting</Err>
                </div>
                <div>
                  <Label>Telefon</Label>
                  <input className={`${input} tnum`} value={d.phone} onChange={(e) => patch({ phone: maskPhone(e.target.value) })} inputMode="tel" autoComplete="tel" placeholder="+998 90 123 45 67" />
                  <Err show={tried && !phone}>Raqam to‘liq emas: +998 XX XXX XX XX</Err>
                </div>
                <div>
                  <Label hint="ixtiyoriy">Qisqacha tavsif</Label>
                  <textarea
                    className={`${input} h-28 resize-none py-3`}
                    value={d.description}
                    onChange={(e) => patch({ description: e.target.value.slice(0, 400) })}
                    placeholder="Nimasi bilan yaxshi? Masalan: guruhlar 10 kishigacha, har oy ota-onalarga hisobot"
                  />
                  <p className="tnum mt-1 px-1 text-right text-caption text-ink3">{d.description.length}/400</p>
                </div>
                <div>
                  <Label hint="ixtiyoriy">O‘quvchilar yoshi</Label>
                  <div className="flex items-center gap-2">
                    <input className={`${input} tnum text-center`} inputMode="numeric" placeholder="dan, 6" value={d.ageFrom} onChange={(e) => patch({ ageFrom: e.target.value.replace(/\D/g, "").slice(0, 2) })} aria-label="Yoshdan" />
                    <span className="text-ink3">—</span>
                    <input className={`${input} tnum text-center`} inputMode="numeric" placeholder="gacha, 17" value={d.ageTo} onChange={(e) => patch({ ageTo: e.target.value.replace(/\D/g, "").slice(0, 2) })} aria-label="Yoshgacha" />
                  </div>
                </div>
                <div>
                  <Label hint="ixtiyoriy">Sharoitlar</Label>
                  <div className="flex flex-wrap gap-2">
                    {AMENITIES.map((a) => {
                      const on = d.amenities.includes(a);
                      return (
                        <Chip key={a} active={on} onClick={() => patch({ amenities: on ? d.amenities.filter((x) => x !== a) : [...d.amenities, a].slice(0, 8) })}>
                          {on && <Check size={15} strokeWidth={3} aria-hidden />}
                          {a}
                        </Chip>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {step === "location" && (
              <div className="space-y-4">
                <p className="px-1 text-subhead text-ink2">Xaritani surib, pinni {d.kind === "tutor" ? "dars o‘tadigan joy" : "markaz binosi"} ustiga qo‘ying. «Sputnik» binoni topishga yordam beradi.</p>
                <Err show={tried && (!d.pos || (!picked && !userPos))}>Xaritani surib, pinni aniq joyga qo‘ying</Err>
                <div className="h-[46vh] min-h-[260px]">
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center rounded-card bg-card text-ink2">
                        <Spinner />
                      </div>
                    }
                  >
                    <MapPicker initial={d.pos ?? userPos ?? RISHTON} follow={picked ? null : userPos} onUserMove={() => setPicked(true)} onChange={(p) => patch({ pos: p })} />
                  </Suspense>
                </div>
                <div>
                  <Label>Manzil</Label>
                  <input className={input} value={d.address} onChange={(e) => patch({ address: e.target.value.slice(0, 150) })} placeholder="Ko‘cha, uy, mo‘ljal — masalan: Navoiy ko‘chasi 5, bozor yonida" />
                  <Err show={tried && d.address.trim().length < 3}>Manzilni yozing — ota-onalar shu bo‘yicha topadi</Err>
                </div>
              </div>
            )}

            {step === "groups" && (
              <div className="space-y-3">
                <p className="px-1 text-subhead text-ink2">Har bir guruh: fan, kunlar, vaqt, narx va bo‘sh joylar. Keyin botda bir bosishda o‘zgartirasiz.</p>
                {d.groups.map((g, k) => (
                  <div key={k} className="flex items-center gap-3 rounded-card bg-card p-4 shadow-card">
                    <SubjectIcon name={g.subject} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-headline">{g.subject}</div>
                      <div className="tnum mt-0.5 flex items-center gap-1 text-footnote text-ink2">
                        <Clock size={13} aria-hidden /> {g.days.join(", ")} · {g.time}
                      </div>
                      <div className="tnum mt-0.5 text-footnote">
                        <span className="font-semibold">{fmtSum(g.price)}</span>
                        <span className="text-ink2"> · {g.freeSeats} ta bo‘sh joy</span>
                      </div>
                    </div>
                    <button aria-label="Tahrirlash" onClick={() => setGroupEdit((x) => ({ open: true, idx: k, key: x.key + 1 }))} className="flex h-10 w-10 items-center justify-center rounded-full text-tint active:bg-fill">
                      <Pencil size={19} />
                    </button>
                    <button aria-label="O‘chirish" onClick={() => patch({ groups: d.groups.filter((_, j) => j !== k) })} className="flex h-10 w-10 items-center justify-center rounded-full text-red-text active:bg-fill">
                      <Trash2 size={19} />
                    </button>
                  </div>
                ))}
                {d.groups.length < 10 && (
                  <button
                    onClick={() => setGroupEdit((x) => ({ open: true, idx: null, key: x.key + 1 }))}
                    className="focus-ring pressable flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-tint/40 py-5 text-headline text-tint"
                  >
                    <Plus size={22} /> {d.groups.length ? "Yana guruh qo‘shish" : "Birinchi guruhni qo‘shish"}
                  </button>
                )}
                <Err show={tried && !d.groups.length}>Kamida bitta guruh qo‘shing</Err>
              </div>
            )}

            {step === "teachers" && (
              <div className="space-y-3">
                <p className="px-1 text-subhead text-ink2">Ota-onalar ustozlar haqida bilishni xohlaydi — tajriba va sertifikatlar ishonch uyg‘otadi.</p>
                {d.teachers.map((t, k) => (
                  <div key={k} className="flex items-center gap-3 rounded-card bg-card p-3.5 shadow-card">
                    <Avatar name={t.name} size={48} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-headline">{t.name}</div>
                      <div className="truncate text-footnote text-ink2">
                        {t.subject}
                        {t.experience ? ` · ${t.experience} yil` : ""}
                        {t.about ? ` · ${t.about}` : ""}
                      </div>
                    </div>
                    <button aria-label="Tahrirlash" onClick={() => setTeacherEdit((x) => ({ open: true, idx: k, key: x.key + 1 }))} className="flex h-10 w-10 items-center justify-center rounded-full text-tint active:bg-fill">
                      <Pencil size={19} />
                    </button>
                    <button aria-label="O‘chirish" onClick={() => patch({ teachers: d.teachers.filter((_, j) => j !== k) })} className="flex h-10 w-10 items-center justify-center rounded-full text-red-text active:bg-fill">
                      <Trash2 size={19} />
                    </button>
                  </div>
                ))}
                {d.teachers.length < 10 && (
                  <button
                    onClick={() => setTeacherEdit((x) => ({ open: true, idx: null, key: x.key + 1 }))}
                    className="focus-ring pressable flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-tint/40 py-5 text-headline text-tint"
                  >
                    <Plus size={22} /> O‘qituvchi qo‘shish
                  </button>
                )}
              </div>
            )}

            {step === "review" && (
              <div className="space-y-3">
                {[
                  {
                    k: 0,
                    icon: <GraduationCap size={18} />,
                    title: "Tarif",
                    body: d.tariff ? `${TARIFFS[d.tariff].title} — ${fmtSum(TARIFFS[d.tariff].price)}/oy (1-oy bepul)` : "—"
                  },
                  {
                    k: 1,
                    icon: <Pencil size={18} />,
                    title: d.name || "Nomi",
                    body: [d.kind === "tutor" ? "Repetitor" : "O‘quv markazi", d.phone, d.amenities.join(", ")].filter(Boolean).join(" · ")
                  },
                  { k: 2, icon: <MapPin size={18} />, title: "Manzil", body: d.address || "—" },
                  { k: 3, icon: <Clock size={18} />, title: `Guruhlar: ${d.groups.length} ta`, body: d.groups.map((g) => `${g.subject} (${g.days.join(", ")})`).join(", ") || "—" },
                  ...(d.kind === "tutor" ? [] : [{ k: 4, icon: <Users size={18} />, title: `O‘qituvchilar: ${d.teachers.length} ta`, body: d.teachers.map((t) => t.name).join(", ") || "Keyin qo‘shish mumkin" }])
                ].map((r) => (
                  <button key={r.k} onClick={() => go(r.k)} className="focus-ring flex w-full items-start gap-3 rounded-card bg-card p-4 text-left shadow-card active:bg-fill">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tint/10 text-tint" aria-hidden>
                      {r.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-headline">{r.title}</span>
                      <span className="mt-0.5 block text-footnote text-ink2">{r.body}</span>
                    </span>
                    <span className="text-subhead text-tint">O‘zgartirish</span>
                  </button>
                ))}
                <p className="px-2 pt-2 text-footnote text-ink2">
                  Yuborganingizdan keyin admin tekshiradi (odatda 1 kun ichida). Tasdiqlangach markazingiz xaritada ko‘rinadi va arizalar shu botga keladi.
                </p>
                <Err show={bytes > MAX_BYTES}>Ma’lumot juda uzun — tavsif yoki o‘qituvchi izohlarini qisqartiring.</Err>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {!inTelegram && (
        <div className="hairline-t shrink-0 bg-bg px-4 pt-3" style={{ paddingBottom: "calc(12px + var(--safe-bottom))" }}>
          <Button kind={step === "review" ? "green" : "primary"} className="w-full" onClick={next}>
            {nextText}
          </Button>
        </div>
      )}

      <Toast />
      <GroupSheet
        key={`g${groupEdit.key}`}
        open={groupEdit.open}
        initial={groupEdit.idx !== null ? d.groups[groupEdit.idx] : null}
        onClose={() => setGroupEdit((x) => ({ ...x, open: false }))}
        onSave={(g) => {
          patch({ groups: groupEdit.idx !== null ? d.groups.map((x, j) => (j === groupEdit.idx ? g : x)) : [...d.groups, g] });
          setGroupEdit((x) => ({ ...x, open: false }));
        }}
      />
      <TeacherSheet
        key={`t${teacherEdit.key}`}
        open={teacherEdit.open}
        subjects={groupSubjects}
        initial={teacherEdit.idx !== null ? d.teachers[teacherEdit.idx] : null}
        onClose={() => setTeacherEdit((x) => ({ ...x, open: false }))}
        onSave={(t) => {
          patch({ teachers: teacherEdit.idx !== null ? d.teachers.map((x, j) => (j === teacherEdit.idx ? t : x)) : [...d.teachers, t] });
          setTeacherEdit((x) => ({ ...x, open: false }));
        }}
      />
    </div>
  );
}
