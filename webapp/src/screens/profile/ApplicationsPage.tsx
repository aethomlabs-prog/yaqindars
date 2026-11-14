/* Arizalar: holat bosqichlari (yuborildi → ko‘rildi → qabul), sinov darsi vaqti. */
import { motion } from "framer-motion";
import { CalendarClock, ClipboardList } from "lucide-react";
import { SubjectIcon } from "../../components/brand";
import { EmptyState } from "../../components/ios/controls";
import { listItem } from "../../components/ios/motion";
import { Page } from "../../components/ios/Page";
import { fmtDayLabel, fmtListTime, fmtTime } from "../../lib/format";
import type { AppStatus } from "../../lib/types";
import { useApp, useApplications, useProfile } from "../../store/app";
import { useNav } from "../../store/nav";

const STATUS: Record<AppStatus, { label: string; cls: string }> = {
  new: { label: "Yuborildi", cls: "bg-fill text-ink2" },
  seen: { label: "Ko‘rildi", cls: "bg-tint/10 text-tint" },
  accepted: { label: "Qabul qilindi", cls: "bg-green-soft text-green-text" },
  rejected: { label: "Rad etildi", cls: "bg-red-soft text-red-text" }
};
const STEPS: AppStatus[] = ["new", "seen", "accepted"];

function Progress({ status }: { status: AppStatus }) {
  const idx = status === "rejected" ? -1 : STEPS.indexOf(status);
  return (
    <div className="mt-3 flex gap-1" aria-hidden>
      {STEPS.map((s, i) => (
        <span key={s} className={`h-1 flex-1 rounded-full transition-colors duration-500 ${status === "rejected" ? "bg-red/40" : i <= idx ? "bg-green" : "bg-fill"}`} />
      ))}
    </div>
  );
}

export function ApplicationsPage() {
  const apps = useApplications();
  const children = useProfile((s) => s.children);
  const authed = useApp((s) => !!s.backend?.authed);
  const push = useNav((s) => s.push);
  const setTab = useNav((s) => s.setTab);

  return (
    <Page title="Arizalarim" back backLabel="Profil">
      {apps.length ? (
        <div className="mx-4 mt-3 space-y-2.5">
          {apps.map((a, i) => {
            const st = STATUS[a.status];
            const child = children.find((c) => c.id === a.childId);
            const [subject, ...rest] = a.group.split(" · ");
            return (
              <motion.button key={a.id} {...listItem(i)} onClick={() => push({ name: "center", centerId: a.centerId })} className="focus-ring pressable block w-full rounded-card bg-card p-4 text-left shadow-card">
                <div className="flex items-start gap-3">
                  <SubjectIcon name={subject} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate text-headline">{a.centerName}</span>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption ${st.cls}`}>{st.label}</span>
                    </div>
                    <div className="tnum mt-0.5 truncate text-footnote text-ink2">
                      {subject} · {rest.join(" · ")}
                    </div>
                    <div className="mt-0.5 text-footnote text-ink3">
                      {child ? `${child.name} uchun · ` : ""}
                      {fmtListTime(a.createdMs)}
                    </div>
                  </div>
                </div>
                <Progress status={a.status} />
                {a.status === "accepted" && a.trialMs && (
                  <div className="tnum mt-3 flex items-center gap-2 rounded-[12px] bg-green-soft px-3 py-2 text-subhead font-medium text-green-text">
                    <CalendarClock size={17} aria-hidden /> Sinov darsi: {fmtDayLabel(a.trialMs)}, {fmtTime(a.trialMs)}
                  </div>
                )}
              </motion.button>
            );
          })}
          {!authed && <p className="px-2 pt-2 text-center text-footnote text-ink3">Holat o‘zgarishlari Telegram ichida ochilganda yangilanadi.</p>}
        </div>
      ) : (
        <EmptyState icon={<ClipboardList size={26} />} text="Hali ariza yubormagansiz. Markaz sahifasida «Bepul sinov darsi» tugmasini bosing." action="Markazlarni ko‘rish" onAction={() => setTab("home")} />
      )}
    </Page>
  );
}
