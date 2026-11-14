/* Markaz / repetitor sahifasi: tez amallar, guruhlar, ma’lumot, sharhlar, ariza. */
import { motion } from "framer-motion";
import { AlertTriangle, BellPlus, Clock, Heart, MapPin, MessageCircle, Navigation, Phone, Share, Star, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { BOT_USERNAME } from "../../../config";
import { Rating } from "../../components/cards";
import { SubjectIcon } from "../../components/brand";
import { Avatar, Button, EmptyState, SeatChip, VipBadge } from "../../components/ios/controls";
import { Section } from "../../components/ios/Grouped";
import { listItem } from "../../components/ios/motion";
import { Page } from "../../components/ios/Page";
import { fmtDate, fmtSum, isStale, updatedText } from "../../lib/format";
import { distanceKm, formatDistance, routeUrl } from "../../lib/geo";
import { haptic, openLink, openTelegramLink } from "../../lib/telegram";
import type { Review } from "../../lib/types";
import { useApp, useCenter, useOrigin, useProfile } from "../../store/app";
import { useNav } from "../../store/nav";
import { ApplySheet } from "./ApplySheet";

function Action({ icon, label, onClick, href, active }: { icon: ReactNode; label: string; onClick?: () => void; href?: string; active?: boolean }) {
  const cls = `focus-ring pressable flex flex-1 flex-col items-center gap-1 rounded-[14px] bg-card py-2.5 text-caption ${active ? "text-[#FF3B30]" : "text-tint"}`;
  if (href)
    return (
      <a href={href} className={cls} onClick={() => haptic.light()}>
        {icon}
        <span>{label}</span>
      </a>
    );
  return (
    <button onClick={onClick} className={cls} aria-pressed={active}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} yulduz`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={12} fill={i <= n ? "#F5B700" : "none"} color="#F5B700" aria-hidden />
      ))}
    </span>
  );
}

export function CenterPage({ centerId }: { centerId: string }) {
  const c = useCenter(centerId);
  const status = useApp((s) => s.centersStatus);
  const backend = useApp((s) => s.backend);
  const showToast = useApp((s) => s.showToast);
  const favorites = useProfile((s) => s.favorites);
  const toggleFavorite = useProfile((s) => s.toggleFavorite);
  const push = useNav((s) => s.push);
  const { pos } = useOrigin();
  const [apply, setApply] = useState<number | null>(null);
  const [lastGi, setLastGi] = useState(0);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [waiting, setWaiting] = useState<Set<number>>(new Set());
  const [chatBusy, setChatBusy] = useState(false);

  useEffect(() => {
    if (!backend || !c) return;
    let alive = true;
    backend
      .loadReviews(c.id)
      .then((r) => alive && setReviews(r))
      .catch(() => alive && setReviews([]));
    return () => {
      alive = false;
    };
  }, [backend, c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c)
    return (
      <Page title="Markaz" back tabbar={false}>
        {status === "ready" ? <EmptyState icon={<MapPin size={26} />} text="Markaz topilmadi yoki o‘chirilgan." /> : <div className="h-40" />}
      </Page>
    );

  const km = distanceKm(pos, c);
  const fav = favorites.includes(c.id);
  const stale = isStale(c.updatedMs);
  const minPrice = c.groups.length ? Math.min(...c.groups.map((g) => g.price)) : 0;
  const firstFree = Math.max(0, c.groups.findIndex((g) => g.freeSeats > 0));
  const title = c.name.replace(/^Namuna:\s*/, "");

  const openApply = (gi: number) => {
    setLastGi(gi);
    setApply(gi);
  };

  const openChat = async () => {
    if (!backend?.centerChatEnabled) {
      showToast("Chat Telegram ichida ochilganda ishlaydi.", "info");
      return;
    }
    setChatBusy(true);
    try {
      const chatId = await backend.openCenterChat(c);
      push({ name: "conversation", chatId });
    } catch {
      showToast("Chatni ochib bo‘lmadi.", "error");
    } finally {
      setChatBusy(false);
    }
  };

  const share = () => {
    const link = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?startapp=c_${c.id}` : location.href;
    const text = `${c.name} — YaqinDars’da`;
    if (BOT_USERNAME) openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    else if (navigator.share) navigator.share({ title: c.name, text, url: link }).catch(() => {});
    else
      navigator.clipboard
        ?.writeText(`${text}\n${link}`)
        .then(() => showToast("Havola nusxalandi", "ok"))
        .catch(() => {});
  };

  const waitlist = async (gi: number) => {
    try {
      await backend?.joinWaitlist(c.id, gi);
      setWaiting((s) => new Set(s).add(gi));
      haptic.success();
      showToast("Joy bo‘shasa, Telegram’da xabar beramiz", "ok");
    } catch {
      showToast("Bu funksiya Telegram ichida ishlaydi.", "error");
    }
  };

  return (
    <Page
      title={title}
      back
      tabbar={false}
      right={
        <button
          aria-label={fav ? "Saqlanganlardan olib tashlash" : "Saqlash"}
          onClick={() => {
            const on = toggleFavorite(c.id);
            showToast(on ? "Saqlanganlarga qo‘shildi" : "Saqlanganlardan olib tashlandi", "ok");
          }}
          className="focus-ring flex h-11 w-11 items-center justify-center rounded-full pressable"
        >
          <motion.span key={String(fav)} initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
            <Heart size={23} className={fav ? "text-[#FF3B30]" : "text-tint"} fill={fav ? "#FF3B30" : "none"} />
          </motion.span>
        </button>
      }
      bottom={
        c.groups.length > 0 && (
          <div className="blur-bar hairline-t absolute inset-x-0 bottom-0 z-20 flex items-center gap-3 px-4 pt-3" style={{ paddingBottom: "calc(12px + var(--safe-bottom))" }}>
            <div className="min-w-0 flex-1">
              <div className="text-caption text-ink2">Oyiga</div>
              <div className="tnum truncate text-headline">{fmtSum(minPrice)} dan</div>
            </div>
            <Button kind="green" onClick={() => openApply(firstFree)}>
              Bepul sinov darsi
            </Button>
          </div>
        )
      }
    >
      <div style={{ paddingBottom: 80 }}>
        {/* Sarlavha bloki */}
        <div className="flex flex-col items-center px-6 pt-2 text-center">
          {c.kind === "tutor" ? (
            <Avatar name={c.name} src={c.photoUrl} size={88} />
          ) : c.photoUrl ? (
            <img src={c.photoUrl} alt="" className="h-[88px] w-[88px] rounded-[24px] object-cover" />
          ) : (
            <div className="flex h-[88px] w-[88px] items-center justify-center rounded-[24px] bg-tint text-[38px] font-bold text-white" aria-hidden>
              {title[0]}
            </div>
          )}
          <h1 className="mt-3 text-title">{c.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-footnote text-ink2">
            {c.vip && <VipBadge large />}
            <span>{c.kind === "tutor" ? "Repetitor" : "O‘quv markazi"}</span>
            {c.rating ? <Rating value={c.rating} count={c.reviewsCount} /> : null}
          </div>
          <p className="mt-1.5 text-footnote text-ink2">
            <span className="tnum">{formatDistance(km)}</span> · {c.address}
          </p>
        </div>

        {/* Tez amallar */}
        <div className="mx-4 mt-5 flex gap-2">
          {c.phone && <Action icon={<Phone size={21} />} label="Qo‘ng‘iroq" href={`tel:${c.phone}`} />}
          <Action icon={<Navigation size={21} />} label="Yo‘l" onClick={() => openLink(routeUrl(c, pos))} />
          <Action icon={<MessageCircle size={21} />} label={chatBusy ? "…" : "Yozish"} onClick={openChat} />
          <Action icon={<Share size={21} />} label="Ulashish" onClick={share} />
        </div>

        {stale && (
          <div className="mx-4 mt-4 flex gap-3 rounded-card bg-gold-soft p-3.5 text-footnote text-gold-text" role="note">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>Ma’lumot eskirgan bo‘lishi mumkin — yozilishdan oldin qo‘ng‘iroq qilib aniqlang.</span>
          </div>
        )}

        {/* Guruhlar */}
        <h2 className="mb-2 mt-7 px-5 text-title">Guruhlar</h2>
        <div className="mx-4 space-y-2.5">
          {c.groups.map((g, i) => (
            <motion.div key={i} {...listItem(i)} className="rounded-card bg-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <SubjectIcon name={g.subject} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-headline">{g.subject}</span>
                    <span className="tnum shrink-0 text-headline">{fmtSum(g.price)}</span>
                  </div>
                  <div className="tnum mt-0.5 flex items-center gap-1.5 text-footnote text-ink2">
                    <Clock size={13} aria-hidden /> {g.days.join(", ")} · {g.time}
                  </div>
                  <div className="mt-2">
                    <SeatChip n={g.freeSeats} />
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {g.freeSeats > 0 ? (
                  <Button kind="tinted" size="md" className="flex-1" onClick={() => openApply(i)}>
                    Sinov darsiga yozilish
                  </Button>
                ) : (
                  <>
                    <Button kind="gray" size="md" className="flex-1" disabled={waiting.has(i)} onClick={() => waitlist(i)}>
                      <BellPlus size={17} aria-hidden /> {waiting.has(i) ? "Navbatdasiz" : "Joy bo‘shasa xabar ber"}
                    </Button>
                    <Button kind="plain" size="md" onClick={() => openApply(i)}>
                      Ariza
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          ))}
          {!c.groups.length && <p className="px-1 text-subhead text-ink2">Hozircha guruhlar qo‘shilmagan.</p>}
        </div>

        {/* O‘qituvchilar */}
        {c.teachers.length > 0 && (
          <>
            <h2 className="mb-2 mt-7 px-5 text-title">O‘qituvchilar</h2>
            <div className="mx-4 overflow-hidden rounded-card bg-card">
              {c.teachers.map((t, i) => (
                <div key={i} className="group flex items-center gap-3 px-4">
                  <Avatar name={t.name} size={48} />
                  <div className="min-w-0 flex-1 py-3 [box-shadow:inset_0_-0.5px_0_var(--sep)] group-last:shadow-none">
                    <div className="truncate text-headline">{t.name.replace(/^Namuna:\s*/, "")}</div>
                    <div className="mt-0.5 text-footnote text-ink2">
                      {t.subject}
                      {t.experience ? ` · ${t.experience} yil tajriba` : ""}
                    </div>
                    {t.about && <div className="mt-0.5 text-footnote text-ink3">{t.about}</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Ma’lumot */}
        {c.description && (
          <>
            <h2 className="mb-2 mt-7 px-5 text-title">Haqida</h2>
            <p className="mx-4 rounded-card bg-card p-4 text-body leading-6">{c.description}</p>
          </>
        )}

        <div className="mt-7">
          <Section header="Ma’lumot" footer={updatedText(c.updatedMs)}>
            <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5 [box-shadow:inset_0_-0.5px_0_var(--sep)]">
              <MapPin size={18} className="shrink-0 text-ink2" aria-hidden />
              <span className="flex-1 text-body">{c.address}</span>
            </div>
            {c.ageFrom != null && c.ageTo != null && (
              <div className="flex min-h-[44px] items-center gap-3 px-4 py-2.5 [box-shadow:inset_0_-0.5px_0_var(--sep)]">
                <Users size={18} className="shrink-0 text-ink2" aria-hidden />
                <span className="flex-1 text-body">
                  {c.ageFrom}–{c.ageTo} yosh
                </span>
              </div>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex min-h-[44px] items-center gap-3 px-4 py-2.5 active:bg-fill">
                <Phone size={18} className="shrink-0 text-ink2" aria-hidden />
                <span className="tnum flex-1 text-body text-tint">{c.phone}</span>
              </a>
            )}
          </Section>
        </div>

        {c.amenities.length > 0 && (
          <>
            <h2 className="mb-2 px-5 text-title">Sharoitlar</h2>
            <div className="mx-4 flex flex-wrap gap-2">
              {c.amenities.map((a) => (
                <span key={a} className="rounded-full bg-card px-3 py-1.5 text-subhead shadow-[0_0_0_0.5px_var(--sep)]">
                  {a}
                </span>
              ))}
            </div>
          </>
        )}

        {/* Sharhlar */}
        {reviews && reviews.length > 0 && (
          <>
            <div className="mb-2 mt-7 flex items-baseline justify-between px-5">
              <h2 className="text-title">Sharhlar</h2>
              <Rating value={c.rating} count={c.reviewsCount} />
            </div>
            <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 scroll-px-4">
              {reviews.map((r) => (
                <div key={r.id} className="w-[260px] shrink-0 snap-start rounded-card bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-headline">{r.author}</span>
                    <span className="text-caption text-ink3">{fmtDate(r.createdMs)}</span>
                  </div>
                  <Stars n={r.rating} />
                  <p className="mt-2 line-clamp-4 text-subhead">{r.text}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <ApplySheet center={c} groupIndex={apply ?? lastGi} open={apply !== null} onClose={() => setApply(null)} />
    </Page>
  );
}
