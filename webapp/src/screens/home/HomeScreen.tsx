import { motion } from "framer-motion";
import { CalendarClock, ChevronDown, MapPin, Navigation, WifiOff } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { FreeSeatCard, Rating, TutorRow } from "../../components/cards";
import { SubjectIcon } from "../../components/brand";
import { Button, EmptyState, SearchBar, Skeleton, VipBadge } from "../../components/ios/controls";
import { listItem } from "../../components/ios/motion";
import { Page } from "../../components/ios/Page";
import { fmtDayLabel, fmtSum, fmtTime } from "../../lib/format";
import { distanceKm, formatDistance, routeUrl } from "../../lib/geo";
import { openLink, openTelegramLink } from "../../lib/telegram";
import { displayName, IS_DEMO, useApp, useApplications, useCenter, useOrigin, useBotUsername } from "../../store/app";
import { useFilters } from "../../store/filters";
import { useNav } from "../../store/nav";
import { AddressSheet } from "./AddressSheet";
import HomeBanner from "../../components/HomeBanner";

const GRID = ["Ingliz tili", "Matematika", "IT", "Rus tili", "Kimyo", "Biologiya", "Sport"];

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-3 mt-7 flex items-baseline justify-between px-5">
      <h2 className="text-title">{title}</h2>
      {action && (
        <button onClick={onAction} className="text-subhead text-tint">
          {action}
        </button>
      )}
    </div>
  );
}

function TrialCard() {
  const apps = useApplications();
  const next = apps.filter((a) => a.status === "accepted" && a.trialMs && a.trialMs > Date.now() - 2 * 3600000).sort((a, b) => a.trialMs! - b.trialMs!)[0];
  const center = useCenter(next?.centerId);
  const { pos } = useOrigin();
  if (!next) return null;
  return (
    <motion.div {...listItem(0)} className="mx-4 mt-5 overflow-hidden rounded-card bg-tint p-4 text-white">
      <div className="flex items-center gap-2 text-footnote font-semibold uppercase tracking-wide opacity-80">
        <CalendarClock size={15} aria-hidden /> Sinov darsingiz
      </div>
      <div className="mt-2 text-title">{next.group.split(" · ")[0]}</div>
      <div className="mt-0.5 text-subhead opacity-90">{next.centerName}</div>
      <div className="tnum mt-3 text-headline">
        {fmtDayLabel(next.trialMs!)}, {fmtTime(next.trialMs!)}
      </div>
      {center && (
        <button
          onClick={() => openLink(routeUrl(center, pos))}
          className="pressable mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white/20 px-4 text-subhead font-semibold"
        >
          <Navigation size={16} aria-hidden /> Yo‘l ko‘rsatish
        </button>
      )}
    </motion.div>
  );
}

function VipCarousel({ items }: { items: { c: import("../../lib/types").Center; km: number }[] }) {
  const [page, setPage] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const push = useNav((s) => s.push);
  if (!items.length) return null;
  return (
    <>
      <SectionTitle title="Tavsiya etilgan" />
      <div
        ref={ref}
        onScroll={(e) => setPage(Math.round(e.currentTarget.scrollLeft / (e.currentTarget.clientWidth - 32)))}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 scroll-px-4"
      >
        {items.map(({ c, km }) => (
          <button
            key={c.id}
            onClick={() => push({ name: "center", centerId: c.id })}
            className="focus-ring pressable flex w-[calc(100%-8px)] shrink-0 snap-start flex-col rounded-card bg-card p-4 text-left shadow-card"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-tint text-[24px] font-bold text-white" aria-hidden>
                {c.name.replace(/^Namuna:\s*/, "")[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-headline">{c.name}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <VipBadge />
                  <Rating value={c.rating} count={c.reviewsCount} />
                </div>
              </div>
            </div>
            <p className="mt-3 line-clamp-2 text-subhead text-ink2">{c.description || c.address}</p>
            <div className="mt-3 flex items-center justify-between text-footnote">
              <span className="text-ink2">
                <span className="tnum">{formatDistance(km)}</span> · {[...new Set(c.groups.map((g) => g.subject))].join(", ")}
              </span>
              <span className="tnum font-semibold">{fmtSum(Math.min(...c.groups.map((g) => g.price)))} dan</span>
            </div>
          </button>
        ))}
      </div>
      {items.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {items.map((x, i) => (
            <span key={x.c.id} className={`h-1.5 rounded-full transition-all ${i === page ? "w-4 bg-ink" : "w-1.5 bg-ink3"}`} />
          ))}
        </div>
      )}
    </>
  );
}

export function HomeScreen() {
  const centers = useApp((s) => s.centers);
  const status = useApp((s) => s.centersStatus);
  const loadCenters = useApp((s) => s.loadCenters);
  const push = useNav((s) => s.push);
  const setTab = useNav((s) => s.setTab);
  const setFilters = useFilters((s) => s.set);
  const { pos, label } = useOrigin();
  const [addrOpen, setAddrOpen] = useState(false);

  const { free, vip, tutors } = useMemo(() => {
    const withKm = centers.map((c) => ({ c, km: distanceKm(pos, c) }));
    const free = withKm
      .filter((x) => x.c.kind === "center")
      .flatMap((x) => x.c.groups.map((g, gi) => ({ ...x, gi, seats: g.freeSeats })).filter((y) => y.seats > 0))
      .sort((a, b) => a.km - b.km)
      .slice(0, 8);
    const vip = withKm.filter((x) => x.c.vip).sort((a, b) => a.km - b.km);
    const tutors = withKm.filter((x) => x.c.kind === "tutor").sort((a, b) => a.km - b.km);
    return { free, vip, tutors };
  }, [centers, pos]);

  const botUsername = useBotUsername();

  const onBanner = (id: "seats" | "trial" | "owner") => {
    if (id === "seats") {
      setFilters({ freeOnly: true, subject: null });
      setTab("map");
    } else if (id === "trial") {
      setTab("map");
    } else if (botUsername) {
      // /markaz bilan bir xil: bot «📝 Markazni qo‘shish» tugmasini beradi (ma’lumot sendData orqali botga ketadi)
      openTelegramLink(`https://t.me/${botUsername}?start=markaz`);
    } else {
      // bot username hali noma’lum — ro‘yxatdan o‘tish formasini to‘g‘ridan-to‘g‘ri ochamiz
      const u = new URL(location.href);
      u.searchParams.set("mode", "register");
      location.href = u.toString();
    }
  };

  const openSubject = (s: string | null) => {
    setFilters({ subject: s });
    setTab("map");
  };

  return (
    <Page
      title={`Salom, ${displayName()}`}
      large
      onRefresh={loadCenters}
      largeContent={
        <div>
          <div className="flex items-center gap-2">
            <h1 className="truncate text-large-title">Salom, {displayName()}</h1>
            {IS_DEMO && <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold tracking-wide text-[#3D2E00]">DEMO</span>}
          </div>
          <button onClick={() => setAddrOpen(true)} className="focus-ring mt-1 inline-flex h-8 items-center gap-1 text-subhead text-ink2" aria-label="Manzilni tanlash">
            <MapPin size={15} className="text-tint" aria-hidden />
            <span className="max-w-[240px] truncate">Rishton · {label}</span>
            <ChevronDown size={15} aria-hidden />
          </button>
        </div>
      }
      below={
        <div className="px-4 pt-2">
          <SearchBar asButton placeholder="Fan, markaz yoki ustoz" onPress={() => push({ name: "search" })} />
        </div>
      }
    >
      <div className="mt-4">
        <HomeBanner onAction={onBanner} />
      </div>

      {/* Fanlar grid: 2 × 4 */}
      <div className="mx-4 mt-5 grid grid-cols-4 gap-y-4 rounded-card bg-card px-2 py-4 shadow-card">
        {GRID.map((s) => (
          <button key={s} onClick={() => openSubject(s)} className="focus-ring pressable flex flex-col items-center gap-1.5">
            <SubjectIcon name={s} size={48} />
            <span className="max-w-full truncate px-0.5 text-caption text-ink">{s}</span>
          </button>
        ))}
        <button onClick={() => openSubject(null)} className="focus-ring pressable flex flex-col items-center gap-1.5">
          <SubjectIcon name="Boshqa" size={48} />
          <span className="text-caption text-ink">Yana</span>
        </button>
      </div>

      <TrialCard />

      {status === "error" && (
        <EmptyState icon={<WifiOff size={26} />} text="Ma’lumotlarni yuklab bo‘lmadi. Internetni tekshiring." action="Qayta urinish" onAction={loadCenters} />
      )}

      {(status === "loading" || status === "idle") && !centers.length && (
        <>
          <div className="mb-3 mt-7 px-5">
            <Skeleton className="h-6 w-48" />
          </div>
          <div className="flex gap-3 overflow-hidden px-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-[150px] w-[240px] shrink-0 rounded-card" />
            ))}
          </div>
          <div className="mx-4 mt-7 space-y-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-[140px] rounded-card" />
          </div>
        </>
      )}

      {status === "ready" && !centers.length && (
        <EmptyState icon={<MapPin size={26} />} text="Hozircha bu hududda markazlar yo‘q." action="Xaritani ochish" onAction={() => setTab("map")} />
      )}

      {free.length > 0 && (
        <>
          <SectionTitle title="Hozir bo‘sh joy bor" action="Barchasi" onAction={() => (setFilters({ freeOnly: true, subject: null }), setTab("map"))} />
          <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 scroll-px-4">
            {free.map((x) => (
              <FreeSeatCard key={`${x.c.id}-${x.gi}`} c={x.c} groupIndex={x.gi} km={x.km} />
            ))}
          </div>
        </>
      )}

      <VipCarousel items={vip} />

      {tutors.length > 0 && (
        <>
          <SectionTitle title="Repetitorlar" />
          <div className="mx-4 overflow-hidden rounded-card bg-card shadow-card [&>button:last-child>span]:shadow-none">
            {tutors.map(({ c, km }) => (
              <TutorRow key={c.id} c={c} km={km} />
            ))}
          </div>
        </>
      )}

      {centers.length > 0 && (
        <div className="mt-8 flex justify-center">
          <Button kind="tinted" size="md" onClick={() => openSubject(null)}>
            Hamma markazlar xaritada
          </Button>
        </div>
      )}

      <AddressSheet open={addrOpen} onClose={() => setAddrOpen(false)} />
    </Page>
  );
}
