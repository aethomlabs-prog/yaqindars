/* Ta’lim beruvchi kabineti (bot: «🎓 Ta’lim beruvchi bo‘lib kirish» → ?mode=owner).
 * Markazlarim → statistika, arizalar (Ko‘rdim / Qabul / Rad), guruhlar (bo‘sh joy ➖/➕, narx). */
import { motion } from "framer-motion";
import { CalendarClock, Check, ClipboardList, Eye, Hourglass, Map, Minus, Phone, Plus, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LogoMark, SubjectIcon } from "../components/brand";
import { Button, Chip, EmptyState, VipBadge } from "../components/ios/controls";
import { listItem } from "../components/ios/motion";
import { Sheet } from "../components/ios/Sheet";
import { Spinner } from "../components/ios/Spinner";
import { Toast } from "../components/ios/Toast";
import { OfflineBanner } from "../components/OfflineBanner";
import type { OwnerCenter } from "../lib/backend";
import { fmtDayLabel, fmtListTime, fmtSum, fmtTime, nextLessonMs } from "../lib/format";
import { haptic, inTelegram, tg, tgUser } from "../lib/telegram";
import type { Application, AppStatus, Group } from "../lib/types";
import { useApp } from "../store/app";

const STATUS: Record<AppStatus, { label: string; cls: string }> = {
  new: { label: "Yangi", cls: "bg-tint text-white" },
  seen: { label: "Ko‘rildi", cls: "bg-tint/10 text-tint" },
  accepted: { label: "Qabul qilindi", cls: "bg-green-soft text-green-text" },
  rejected: { label: "Rad etildi", cls: "bg-red-soft text-red-text" }
};

function goMainApp() {
  const u = new URL(location.href);
  u.searchParams.delete("mode");
  location.replace(u.toString());
}

function Stat({ icon, value, label, tone }: { icon: React.ReactNode; value: number | string; label: string; tone: string }) {
  return (
    <div className="flex-1 rounded-card bg-card p-3.5 shadow-card">
      <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `${tone}1A`, color: tone }} aria-hidden>
        {icon}
      </div>
      <div className="tnum mt-2 text-title">{value}</div>
      <div className="text-footnote text-ink2">{label}</div>
    </div>
  );
}

function PriceSheet({ group, onSave, onClose }: { group: Group | null; onSave: (price: number) => void; onClose: () => void }) {
  const [v, setV] = useState(group ? String(group.price) : "");
  const n = Number(v.replace(/\D/g, ""));
  const ok = n >= 10000 && n <= 10000000;
  return (
    <Sheet
      open={!!group}
      onClose={onClose}
      title="Oylik narx"
      footer={
        <Button className="w-full" disabled={!ok} onClick={() => onSave(n)}>
          Saqlash
        </Button>
      }
    >
      <div className="px-4 pb-2">
        <p className="mb-3 text-center text-subhead text-ink2">{group?.subject} guruhi</p>
        <input
          autoFocus
          inputMode="numeric"
          className="tnum h-14 w-full rounded-[14px] bg-card2 px-4 text-center text-title outline-none focus:ring-2 focus:ring-tint/40"
          value={n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") : ""}
          onChange={(e) => setV(e.target.value)}
          placeholder="250 000"
          aria-label="Narx, so‘m"
        />
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
          {[150000, 200000, 250000, 300000, 400000].map((p) => (
            <Chip key={p} active={n === p} onClick={() => setV(String(p))}>
              {p / 1000} ming
            </Chip>
          ))}
        </div>
      </div>
    </Sheet>
  );
}

function AppCard({ a, i, onStatus }: { a: Application; i: number; onStatus: (s: AppStatus) => void }) {
  const st = STATUS[a.status];
  const [subject, ...rest] = a.group.split(" · ");
  return (
    <motion.div {...listItem(i)} className="rounded-card bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-headline">{a.name}</div>
          <div className="tnum mt-0.5 text-footnote text-ink2">
            {subject} · {rest.join(" · ")}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption ${st.cls}`}>{st.label}</span>
      </div>
      {a.comment && <p className="mt-2 rounded-[10px] bg-card2 px-3 py-2 text-subhead">{a.comment}</p>}
      <div className="mt-2 flex items-center justify-between text-footnote text-ink3">
        <span>{fmtListTime(a.createdMs)}</span>
        {a.status === "accepted" && a.trialMs && (
          <span className="tnum flex items-center gap-1 text-green-text">
            <CalendarClock size={14} aria-hidden /> {fmtDayLabel(a.trialMs)}, {fmtTime(a.trialMs)}
          </span>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <a href={`tel:${a.phone}`} onClick={() => haptic.light()} className="focus-ring pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-btn bg-tint/10 text-subhead font-semibold text-tint">
          <Phone size={17} aria-hidden /> Qo‘ng‘iroq
        </a>
        {a.status === "new" && (
          <button onClick={() => onStatus("seen")} aria-label="Ko‘rdim" className="focus-ring pressable flex h-11 w-11 items-center justify-center rounded-btn bg-fill text-ink">
            <Eye size={19} />
          </button>
        )}
        {(a.status === "new" || a.status === "seen") && (
          <>
            <button onClick={() => onStatus("rejected")} aria-label="Rad etish" className="focus-ring pressable flex h-11 w-11 items-center justify-center rounded-btn bg-red-soft text-red-text">
              <X size={20} />
            </button>
            <button onClick={() => onStatus("accepted")} className="focus-ring pressable flex h-11 flex-1 items-center justify-center gap-1.5 rounded-btn bg-[#13804F] text-subhead font-semibold text-white">
              <Check size={18} aria-hidden /> Qabul
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default function OwnerApp() {
  const backend = useApp((s) => s.backend);
  const showToast = useApp((s) => s.showToast);
  const [centers, setCenters] = useState<OwnerCenter[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [tab, setTab] = useState<"apps" | "groups">("apps");
  const [priceIdx, setPriceIdx] = useState<number | null>(null);

  const owner = backend?.owner;
  useEffect(() => {
    if (!owner) return;
    return owner.watchMyCenters((c) => {
      setCenters(c);
      setActive((a) => a ?? c[0]?.id ?? null);
    });
  }, [owner]);

  useEffect(() => {
    if (!owner || !active) return;
    return owner.watchCenterApplications(active, setApps);
  }, [owner, active]);

  const center = centers?.find((c) => c.id === active);
  const stats = useMemo(
    () => ({
      fresh: apps.filter((a) => a.status === "new").length,
      accepted: apps.filter((a) => a.status === "accepted").length,
      seats: center?.groups.reduce((s, g) => s + g.freeSeats, 0) ?? 0
    }),
    [apps, center]
  );

  const setSeats = async (gi: number, delta: number) => {
    if (!center || !owner) return;
    haptic.selection();
    const groups = center.groups.map((g, i) => (i === gi ? { ...g, freeSeats: Math.max(0, Math.min(100, g.freeSeats + delta)) } : g));
    setCenters((cs) => cs!.map((c) => (c.id === center.id ? { ...c, groups } : c))); // darhol ko‘rinsin
    try {
      await owner.saveGroups(center.id, groups);
    } catch {
      showToast("Saqlanmadi. Internetni tekshiring.", "error");
    }
  };

  const setPrice = async (price: number) => {
    if (!center || !owner || priceIdx === null) return;
    const groups = center.groups.map((g, i) => (i === priceIdx ? { ...g, price } : g));
    setPriceIdx(null);
    try {
      await owner.saveGroups(center.id, groups);
      haptic.success();
      showToast("Narx yangilandi", "ok");
    } catch {
      showToast("Saqlanmadi", "error");
    }
  };

  const setStatus = async (a: Application, status: AppStatus) => {
    if (!owner || !center) return;
    const g = center.groups[a.groupIndex];
    const trial = status === "accepted" && g ? nextLessonMs(g.days, g.time) : null;
    try {
      await owner.setApplicationStatus(a, status, trial);
      haptic.success();
      showToast(status === "accepted" ? "Qabul qilindi — ota-onaga xabar boradi" : status === "rejected" ? "Rad etildi" : "Ko‘rildi deb belgilandi", "ok");
    } catch {
      showToast("Saqlanmadi", "error");
    }
  };

  const sortedApps = [...apps].sort((x, y) => Number(y.status === "new") - Number(x.status === "new") || Number(y.status === "seen") - Number(x.status === "seen") || y.createdMs - x.createdMs);

  return (
    <div className="scroll-y no-scrollbar bg-bg" style={{ height: "var(--vh)" }}>
      <header className="px-5 pb-2" style={{ paddingTop: "calc(14px + var(--safe-top))" }}>
        <div className="flex items-center gap-2 text-subhead text-ink2">
          <LogoMark size={22} /> Ta’lim beruvchi kabineti
        </div>
        <h1 className="mt-2 text-large-title">Salom{tgUser ? `, ${tgUser.first_name}` : ""}</h1>
      </header>

      {!backend ? (
        <div className="flex justify-center py-20 text-ink2">
          <Spinner size={28} />
        </div>
      ) : !owner ? (
        <EmptyState
          icon={<Users size={26} />}
          text={
            inTelegram
              ? "Kabinetga kirish uchun botdagi «🎓 Ta’lim beruvchi bo‘lib kirish» tugmasini bosing, so‘ng «Kabinetni ochish»ni tanlang."
              : "Kabinet Telegram ichida ishlaydi: botga /start yozing va «🎓 Ta’lim beruvchi bo‘lib kirish» tugmasini bosing."
          }
          action="Ilovaga o‘tish"
          onAction={goMainApp}
        />
      ) : centers === null ? (
        <div className="flex justify-center py-20 text-ink2">
          <Spinner size={28} />
        </div>
      ) : !centers.length ? (
        <EmptyState
          icon={<ClipboardList size={26} />}
          text="Sizda hali markaz yo‘q. Botda /markaz yozing va «📝 Markazni qo‘shish» orqali 3–5 daqiqada ro‘yxatdan o‘ting — birinchi oy bepul."
          action="Botga qaytish"
          onAction={() => (tg?.close ? tg.close() : goMainApp())}
        />
      ) : (
        <div className="pb-10">
          {centers.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 pt-1">
              {centers.map((c) => (
                <Chip key={c.id} active={c.id === active} onClick={() => setActive(c.id)}>
                  {c.name.replace(/^Namuna:\s*/, "")}
                </Chip>
              ))}
            </div>
          )}

          {center && (
            <>
              <div className="mx-4 mt-3 rounded-card bg-card p-4 shadow-card">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-headline">{center.name}</span>
                  {center.vip && <VipBadge />}
                </div>
                <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption ${center.approved ? "bg-green-soft text-green-text" : "bg-gold-soft text-gold-text"}`}>
                  {center.approved ? <Check size={13} strokeWidth={3} aria-hidden /> : <Hourglass size={13} aria-hidden />}
                  {center.approved ? "Xaritada ko‘rinmoqda" : "Admin tekshiruvida"}
                </div>
                {center.tariff && (
                  <div className="tnum mt-2 text-footnote text-ink2">
                    Tarif: {center.tariff === "vip" ? "VIP — 150 000" : "Oddiy — 75 000"} so‘m/oy
                  </div>
                )}
              </div>

              <div className="mx-4 mt-3 flex gap-2.5">
                <Stat icon={<ClipboardList size={17} />} value={stats.fresh} label="Yangi ariza" tone="#1E6FD9" />
                <Stat icon={<Check size={17} />} value={stats.accepted} label="Qabul qilingan" tone="#13804F" />
                <Stat icon={<Users size={17} />} value={stats.seats} label="Bo‘sh joy" tone="#B45309" />
              </div>

              <div className="mx-4 mt-5 flex rounded-[10px] bg-fill p-[2px]" role="tablist">
                {(
                  [
                    ["apps", `Arizalar${stats.fresh ? ` (${stats.fresh})` : ""}`],
                    ["groups", "Guruhlar"]
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => (haptic.selection(), setTab(k))}
                    className={`focus-ring h-9 flex-1 rounded-[8px] text-[14px] font-semibold transition-colors ${tab === k ? "bg-card text-ink shadow-card" : "text-ink2"}`}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {tab === "apps" ? (
                <div className="mx-4 mt-3 space-y-2.5">
                  {sortedApps.length ? (
                    sortedApps.map((a, i) => <AppCard key={a.id} a={a} i={i} onStatus={(s) => setStatus(a, s)} />)
                  ) : (
                    <EmptyState icon={<ClipboardList size={26} />} text="Hozircha ariza yo‘q. Ota-onalar «Bepul sinov darsi» tugmasini bosganda shu yerda va botda chiqadi." />
                  )}
                </div>
              ) : (
                <div className="mx-4 mt-3 space-y-2.5">
                  {center.groups.map((g, gi) => (
                    <div key={gi} className="rounded-card bg-card p-4 shadow-card">
                      <div className="flex items-center gap-3">
                        <SubjectIcon name={g.subject} size={42} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-headline">{g.subject}</div>
                          <div className="tnum text-footnote text-ink2">
                            {g.days.join(", ")} · {g.time}
                          </div>
                        </div>
                        <button onClick={() => setPriceIdx(gi)} className="tnum rounded-full bg-tint/10 px-3 py-1.5 text-footnote font-semibold text-tint">
                          {fmtSum(g.price)}
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between rounded-[14px] bg-card2 px-3 py-2">
                        <span className="text-subhead font-medium">Bo‘sh joy</span>
                        <div className="flex items-center gap-3">
                          <button aria-label="Kamaytirish" disabled={g.freeSeats <= 0} onClick={() => setSeats(gi, -1)} className="focus-ring pressable flex h-11 w-11 items-center justify-center rounded-full bg-card text-tint shadow-card disabled:opacity-30">
                            <Minus size={20} />
                          </button>
                          <span className={`tnum w-10 text-center text-title ${g.freeSeats ? "" : "text-red-text"}`}>{g.freeSeats}</span>
                          <button aria-label="Ko‘paytirish" onClick={() => setSeats(gi, 1)} className="focus-ring pressable flex h-11 w-11 items-center justify-center rounded-full bg-tint text-white">
                            <Plus size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="px-2 text-footnote text-ink2">O‘zgarishlar xaritada darhol ko‘rinadi. Joy 0 dan ko‘paysa, navbatda turgan ota-onalarga Telegram’da xabar boradi.</p>
                </div>
              )}
            </>
          )}

          <div className="mx-4 mt-8">
            <Button kind="tinted" className="w-full" onClick={goMainApp}>
              <Map size={19} aria-hidden /> Ota-onalar ko‘rinishida ochish
            </Button>
          </div>
        </div>
      )}

      <PriceSheet key={priceIdx ?? -1} group={priceIdx !== null && center ? center.groups[priceIdx] : null} onSave={setPrice} onClose={() => setPriceIdx(null)} />
      <Toast />
      <OfflineBanner />
    </div>
  );
}
