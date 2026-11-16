import { Star } from "lucide-react";
import { fmtPriceFrom, fmtSum } from "../lib/format";
import { formatDistance } from "../lib/geo";
import type { Center } from "../lib/types";
import { useNav } from "../store/nav";
import { Avatar, VipBadge } from "./ios/controls";
import { SeatChip } from "./motion";
import { listItem } from "./ios/motion";
import { SubjectIcon } from "./brand";
import { BadgeCheck } from "lucide-react";

export function Rating({ value, count }: { value: number | null; count?: number }) {
  if (!value) return null;
  return (
    <span className="tnum inline-flex items-center gap-0.5 text-footnote text-ink2">
      <Star size={13} fill="#F5B700" color="#F5B700" aria-hidden />
      <span className="font-semibold text-ink">{value.toFixed(1).replace(".", ",")}</span>
      {count ? <span>({count})</span> : null}
    </span>
  );
}

/** Admin qo‘shgan, egasi hali tasdiqlamagan markaz */
export function UnverifiedBadge({ large }: { large?: boolean }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full bg-fill font-medium text-ink2 ${large ? "px-2.5 py-1 text-footnote" : "px-1.5 py-px text-caption"}`} title="Ma’lumotni markaz hali tasdiqlamagan">
      {large ? "Ma’lumot tasdiqlanmagan" : "Tasdiqlanmagan"}
    </span>
  );
}

/** Ro‘yxat kartochkasi (xarita sheet’i, saqlanganlar, qidiruv natijalari) */
export function CenterRow({ c, km, free, minPrice, subjects, i = 0, onOpen }: { c: Center; km: number; free: number; minPrice: number; subjects: string[]; i?: number; onOpen?: () => void }) {
  const push = useNav((s) => s.push);
  return (
    <button
      {...listItem(i)}
      onClick={onOpen ?? (() => push({ name: "center", centerId: c.id }))}
      className="focus-ring pressable flex w-full gap-3 rounded-card bg-card p-3.5 text-left shadow-card"
    >
      <SubjectIcon name={subjects[0] ?? "Boshqa"} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-headline">{c.name}</span>
          {c.vip && <VipBadge />}
          {c.verified && <BadgeCheck size={16} className="shrink-0 text-green-text" aria-label="Tasdiqlangan" />}
          {!c.claimed && <UnverifiedBadge />}
        </div>
        <div className="mt-0.5 truncate text-footnote text-ink2">
          <span className="tnum">{formatDistance(km)}</span> · {subjects.join(", ")}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="tnum text-subhead font-semibold">{fmtPriceFrom(minPrice)}</span>
          <SeatChip count={free} />
        </div>
      </div>
    </button>
  );
}

/** «Hozir bo‘sh joy bor» gorizontal kartochkasi (240px) */
export function FreeSeatCard({ c, groupIndex, km }: { c: Center; groupIndex: number; km: number }) {
  const push = useNav((s) => s.push);
  const g = c.groups[groupIndex];
  return (
    <button
      onClick={() => push({ name: "center", centerId: c.id })}
      className="focus-ring pressable flex w-[240px] shrink-0 snap-start flex-col rounded-card bg-card p-4 text-left shadow-card"
    >
      <div className="flex items-center justify-between">
        <SubjectIcon name={g.subject} size={40} />
        <SeatChip count={g.freeSeats} />
      </div>
      <span className="mt-3 truncate text-headline">{c.name}</span>
      <span className="mt-0.5 truncate text-footnote text-ink2">
        {g.subject} · {g.days.join(", ")}
      </span>
      <div className="mt-3 flex items-center justify-between text-footnote">
        <span className="tnum text-ink2">{formatDistance(km)}</span>
        <span className="tnum font-semibold">{fmtSum(g.price)}</span>
      </div>
    </button>
  );
}

/** Repetitor qatori */
export function TutorRow({ c, km }: { c: Center; km: number }) {
  const push = useNav((s) => s.push);
  const g = c.groups[0];
  return (
    <button onClick={() => push({ name: "center", centerId: c.id })} className="focus-ring flex w-full items-center gap-3 px-4 text-left active:bg-fill">
      <Avatar name={c.name} src={c.photoUrl} size={48} />
      <span className="flex min-w-0 flex-1 items-center gap-2 py-3 [box-shadow:inset_0_-0.5px_0_var(--sep)]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-headline">{c.name.replace(/^Namuna:\s*/, "")}</span>
          <span className="mt-0.5 flex items-center gap-2 text-footnote text-ink2">
            {g?.subject} · <Rating value={c.rating} /> · <span className="tnum">{formatDistance(km)}</span>
          </span>
        </span>
        {g && g.price > 0 && <span className="tnum shrink-0 text-subhead font-semibold">{Math.round(g.price / 1000)} ming</span>}
      </span>
    </button>
  );
}
