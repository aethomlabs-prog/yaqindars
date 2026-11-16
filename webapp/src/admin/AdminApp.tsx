/* YaqinDars — admin dashboard (bot: /admin → ?mode=admin). Faqat "admin" claim'i bor foydalanuvchi.
 * Umumiy (KPI, tasdiqlash navbati, grafiklar) · Markazlar · Arizalar (CSV) · Xatolar. */
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Eye,
  Hourglass,
  ListOrdered,
  MessageCircle,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Wallet,
  Banknote,
  BadgeCheck,
  BellRing,
  Copy,
  Plus,
  TrendingUp,
  UserX,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { LogoMark, SubjectIcon } from "../components/brand";
import { Button, Chip, Segmented, VipBadge } from "../components/ios/controls";
import { EmptyState, SkeletonList } from "../components/motion";
import { OfflineBanner } from "../components/OfflineBanner";
import type { AdminCenter, AdminCounts, AdminLog, DailyStat, SourceStat } from "../lib/backend";
import { fmtDate, fmtListTime, fmtSum } from "../lib/format";
import { billingOf } from "../lib/billing";
import { haptic, inTelegram, openTelegramLink } from "../lib/telegram";
import type { Application, AppStatus } from "../lib/types";
import { useApp } from "../store/app";
import { BarChart, HBars, StatusBars, TableView, type Point } from "./charts";
import { QuickAddSheet } from "./QuickAddSheet";

type Tab = "overview" | "analytics" | "centers" | "apps" | "logs";
const STALE_DAYS = 14;
const tDate = (ms: number) => new Date(ms + 5 * 3600000).toISOString().slice(0, 10);
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
type App = Application & { tgUsername: string | null };
const DAY = 86400000;
const PRICE = { oddiy: 75000, vip: 150000 } as const;
const STATUS_META: Record<AppStatus, { label: string; color: string; icon: ReactNode }> = {
  new: { label: "Yangi", color: "var(--st-warning)", icon: <Hourglass size={16} /> },
  seen: { label: "Ko‘rildi", color: "var(--viz-1)", icon: <Eye size={16} /> },
  accepted: { label: "Qabul qilindi", color: "var(--st-good)", icon: <CheckCircle2 size={16} /> },
  rejected: { label: "Rad etildi", color: "var(--st-critical)", icon: <XCircle size={16} /> }
};
const clean = (n: string) => n.replace(/^Namuna:\s*/, "");

function goMainApp() {
  const u = new URL(location.href);
  u.searchParams.delete("mode");
  location.replace(u.toString());
}

/* ---------- kichik bloklar ---------- */
function Card({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card bg-card p-4 shadow-card ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-headline">{title}</h3>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

function Kpi({ icon, label, value, sub, tone = "var(--viz-1)", alert }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: string; alert?: boolean }) {
  return (
    <div className={`rounded-card bg-card p-4 shadow-card ${alert ? "ring-2 ring-[var(--st-warning)]" : ""}`}>
      <div className="flex items-center gap-2 text-footnote text-ink2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${tone}1F`, color: tone }} aria-hidden>
          {icon}
        </span>
        {label}
      </div>
      <div className="tnum mt-2 text-[26px] font-bold leading-8">{value}</div>
      {sub && <div className="mt-0.5 text-footnote text-ink3">{sub}</div>}
    </div>
  );
}

/* ---------- markaz kartochkasi (navbat va ro‘yxat uchun) ---------- */
function BillingChip({ c }: { c: AdminCenter }) {
  const b = billingOf(c);
  if (b.state === "pending") return null;
  const m = {
    trial: { cls: "bg-green-soft text-green-text", t: `Sinov: ${b.days} kun` },
    active: { cls: "bg-green-soft text-green-text", t: `To‘langan: ${fmtDate(b.until)}` },
    overdue: { cls: "bg-red-soft text-red-text", t: `Muddati o‘tgan: ${b.days} kun` }
  }[b.state];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-caption ${m.cls}`}>{m.t}</span>;
}

function CenterRow({
  c,
  appsCount,
  busy,
  onSet,
  onPaid,
  onVerify
}: {
  c: AdminCenter;
  appsCount: number;
  busy: boolean;
  onSet: (status: "approved" | "rejected", vip: boolean) => void;
  onPaid: () => void;
  onVerify: () => void;
}) {
  const free = c.groups.reduce((s, g) => s + g.freeSeats, 0);
  const ownerless = !c.ownerTgId;
  const showToast = useApp((s) => s.showToast);
  const copyCode = () =>
    navigator.clipboard
      ?.writeText(`/claimcode ${c.id}`)
      .then(() => showToast("Buyruq nusxalandi — botga yuboring, egasi uchun kod beradi", "ok"))
      .catch(() => showToast(`Botga yozing: /claimcode ${c.id}`, "info"));
  return (
    <div className="flex flex-col gap-3 rounded-[16px] bg-card2 p-3.5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SubjectIcon name={c.groups[0]?.subject ?? "Boshqa"} size={42} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-headline">{clean(c.name)}</span>
            {c.vip && <VipBadge />}
            {ownerless ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-caption text-ink2">
                <UserX size={12} aria-hidden /> Egasiz
              </span>
            ) : (
              <BillingChip c={c} />
            )}
            {c.hidden && <span className="inline-flex items-center rounded-full bg-red-soft px-2 py-0.5 text-caption text-red-text">Yashirilgan</span>}
            {c.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 text-caption text-green-text">
                <BadgeCheck size={12} aria-hidden /> Tasdiqlangan
              </span>
            )}
            {!c.approved && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-caption text-gold-text">
                <Hourglass size={12} aria-hidden /> Kutilmoqda
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-footnote text-ink2">
            {c.kind === "tutor" ? "Repetitor" : "Markaz"} · {c.address}
          </div>
          <div className="tnum mt-0.5 text-footnote text-ink3">
            Tarif: {c.tariff === "vip" ? "VIP" : c.tariff === "oddiy" ? "Oddiy" : "—"} · {c.groups.length} guruh · {free} bo‘sh joy · {appsCount} ariza
            {c.ownerUsername && (
              <>
                {" · "}
                <button className="text-tint" onClick={() => openTelegramLink(`https://t.me/${c.ownerUsername}`)}>
                  @{c.ownerUsername}
                </button>
              </>
            )}
            {c.createdMs ? ` · ${fmtDate(c.createdMs)}` : ""}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {!c.approved ? (
          <>
            <Button kind="gray" size="md" disabled={busy} onClick={() => onSet("rejected", false)}>
              <X size={17} aria-hidden /> Rad
            </Button>
            <Button kind="green" size="md" loading={busy} onClick={() => onSet("approved", c.tariff === "vip")}>
              <Check size={17} aria-hidden /> Tasdiqlash{c.tariff === "vip" ? " (VIP)" : ""}
            </Button>
          </>
        ) : ownerless ? (
          <>
            <Button kind={c.verified ? "gray" : "tinted"} size="md" disabled={busy} onClick={onVerify}>
              <BadgeCheck size={17} aria-hidden /> {c.verified ? "Tasdiqni olish" : "Tasdiqlash ✓"}
            </Button>
            <Button kind="tinted" size="md" onClick={copyCode}>
              <Copy size={17} aria-hidden /> Egasi uchun kod
            </Button>
          </>
        ) : (
          <>
            <Button kind={c.verified ? "gray" : "tinted"} size="md" disabled={busy} onClick={onVerify}>
              <BadgeCheck size={17} aria-hidden /> {c.verified ? "Tasdiqni olish" : "Tasdiqlash ✓"}
            </Button>
            <Button kind="green" size="md" disabled={busy} onClick={onPaid}>
              <Banknote size={17} aria-hidden /> To‘lov +1 oy
            </Button>
            <Button kind={c.vip ? "gray" : "tinted"} size="md" loading={busy} onClick={() => onSet("approved", !c.vip)}>
              <Star size={17} aria-hidden /> {c.vip ? "VIP’ni o‘chirish" : "VIP qilish"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- asosiy ---------- */
export default function AdminApp() {
  const backend = useApp((s) => s.backend);
  const showToast = useApp((s) => s.showToast);
  const api = backend?.admin;
  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [centers, setCenters] = useState<AdminCenter[] | null>(null);
  const [apps, setApps] = useState<App[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [counts, setCounts] = useState<AdminCounts>({ chats: 0, waitlist: 0, ai24h: 0 });
  const [loading, setLoading] = useState(false);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [sources, setSources] = useState<SourceStat[]>([]);
  const [reminding, setReminding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // filtrlar
  const [cq, setCq] = useState("");
  const [cf, setCf] = useState<"all" | "pending" | "approved" | "vip" | "overdue" | "ownerless">("all");
  const [quickOpen, setQuickOpen] = useState(false);
  const [aq, setAq] = useState("");
  const [af, setAf] = useState<AppStatus | "all">("all");

  const load = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const [c, a, l, n, ds, src] = await Promise.all([
        api.loadCenters(),
        api.loadApplications(Date.now() - 90 * DAY),
        api.loadLogs(40),
        api.counts(),
        api.loadDaily(tDate(Date.now() - 90 * DAY)).catch(() => []),
        api.loadSources().catch(() => [])
      ]);
      setDailyStats(ds);
      setSources(src);
      setCenters(c);
      setApps(a);
      setLogs(l);
      setCounts(n);
    } catch (e) {
      console.error(e);
      showToast("Ma’lumotlarni yuklab bo‘lmadi", "error");
    } finally {
      setLoading(false);
    }
  }, [api, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const since = Date.now() - Number(days) * DAY;
  const periodApps = useMemo(() => apps.filter((a) => a.createdMs >= since), [apps, since]);

  const stats = useMemo(() => {
    const cs = centers ?? [];
    const approved = cs.filter((c) => c.approved);
    const pending = cs.filter((c) => !c.approved);
    const vip = approved.filter((c) => c.vip);
    const mrr = approved.filter((c) => !!c.ownerTgId).reduce((s, c) => s + (c.vip || c.tariff === "vip" ? PRICE.vip : PRICE.oddiy), 0);
    const overdue = approved.filter((c) => !!c.ownerTgId && billingOf(c).state === "overdue");
    const ownerless = cs.filter((c) => !c.ownerTgId).length;
    const by = (st: AppStatus) => periodApps.filter((a) => a.status === st).length;
    const decided = by("accepted") + by("rejected");
    const today = apps.filter((a) => a.createdMs >= new Date().setHours(0, 0, 0, 0)).length;
    const errors24 = logs.filter((l) => l.createdMs >= Date.now() - DAY).length;
    return { total: cs.length, approved: approved.length, pending, overdue, ownerless, vip: vip.length, mrr, by, rate: decided ? Math.round((by("accepted") / decided) * 100) : null, today, errors24 };
  }, [centers, periodApps, apps, logs]);

  const daily: Point[] = useMemo(() => {
    const n = Number(days);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const out: Point[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(start.getTime() - i * DAY);
      const next = d.getTime() + DAY;
      out.push({ key: String(d.getTime()), label: `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`, value: periodApps.filter((a) => a.createdMs >= d.getTime() && a.createdMs < next).length });
    }
    return out;
  }, [periodApps, days]);

  const topSubjects: Point[] = useMemo(() => {
    const m = new Map<string, number>();
    periodApps.forEach((a) => {
      const s = a.group.split(" · ")[0] || "Boshqa";
      m.set(s, (m.get(s) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ key: k, label: k, value: v }));
  }, [periodApps]);

  const appsByCenter = useMemo(() => {
    const m = new Map<string, number>();
    periodApps.forEach((a) => m.set(a.centerId, (m.get(a.centerId) ?? 0) + 1));
    return m;
  }, [periodApps]);

  const topCenters: Point[] = useMemo(
    () =>
      [...appsByCenter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, v]) => ({ key: id, label: clean(centers?.find((c) => c.id === id)?.name ?? periodApps.find((a) => a.centerId === id)?.centerName ?? id), value: v })),
    [appsByCenter, centers, periodApps]
  );

  /* ---------- analitika ---------- */
  const funnel = useMemo(() => {
    const from = tDate(since);
    const rows = dailyStats.filter((d) => d.date >= from);
    const sum = (k: keyof Omit<DailyStat, "date">) => rows.reduce((s, d) => s + d[k], 0);
    return { open: sum("open"), view: sum("view"), apply: sum("apply"), accept: sum("accept") };
  }, [dailyStats, since]);

  const funnelDaily = useMemo(() => {
    const by = new Map(dailyStats.map((d) => [d.date, d]));
    const n = Number(days);
    const out: (DailyStat & { label: string })[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const date = tDate(Date.now() - i * DAY);
      const d = by.get(date) ?? { date, open: 0, view: 0, apply: 0, accept: 0 };
      out.push({ ...d, label: `${date.slice(8)}.${date.slice(5, 7)}` });
    }
    return out;
  }, [dailyStats, days]);

  const sourceRows = useMemo(
    () =>
      [...sources]
        .sort((a, b) => b.users - a.users || b.apps - a.apps)
        .map((x) => ({
          ...x,
          label: x.source.startsWith("src_") ? x.source.slice(4) : `QR: ${clean(centers?.find((c) => c.id === x.source.slice(2))?.name ?? x.source.slice(2))}`
        })),
    [sources, centers]
  );

  const stale = useMemo(
    () =>
      (centers ?? [])
        .filter((c) => c.approved && !!c.ownerTgId && !c.hidden && (c.updatedMs || 0) < Date.now() - STALE_DAYS * DAY)
        .sort((a, b) => a.updatedMs - b.updatedMs),
    [centers]
  );

  const remindAll = async () => {
    if (!api || !stale.length) return;
    if (!confirm(`${stale.length} ta markaz egasiga «ma’lumotni yangilang» eslatmasi yuborilsinmi?`)) return;
    setReminding(true);
    try {
      await api.remindStale();
      haptic.success();
      showToast(`Eslatma ${stale.length} ta markazga yuborilmoqda — natija botda`, "ok");
    } catch {
      showToast("Yuborib bo‘lmadi (ruxsat yoki internet)", "error");
    } finally {
      setReminding(false);
    }
  };

  const setCenter = async (c: AdminCenter, status: "approved" | "rejected", vip: boolean) => {
    if (!api) return;
    if (status === "rejected" && !confirm(`«${clean(c.name)}» rad etilsinmi? Markaz o‘chiriladi va egasiga xabar boradi.`)) return;
    setBusyId(c.id);
    try {
      await api.setCenter(c, { status, vip });
      haptic.success();
      showToast(status === "rejected" ? "Rad etildi — egasiga xabar boradi" : c.approved ? (vip ? "VIP yoqildi" : "VIP o‘chirildi") : "Tasdiqlandi — egasiga xabar boradi", "ok");
      setCenters((cs) => (status === "rejected" ? cs!.filter((x) => x.id !== c.id) : cs!.map((x) => (x.id === c.id ? { ...x, approved: true, vip } : x))));
    } catch (e) {
      console.error(e);
      showToast("Saqlanmadi (ruxsat yoki internet)", "error");
    } finally {
      setBusyId(null);
    }
  };

  const verify = async (c: AdminCenter) => {
    if (!api) return;
    const on = !c.verified;
    if (!confirm(on ? `«${clean(c.name)}»: manzil, telefon va faoliyat tekshirildimi? «✓ Tasdiqlangan» belgisi qo‘yiladi.` : `«${clean(c.name)}» dan «Tasdiqlangan» belgisi olinsinmi?`)) return;
    setBusyId(c.id);
    try {
      await api.setVerified(c, on);
      haptic.success();
      showToast(on ? "«✓ Tasdiqlangan» belgisi qo‘yildi" : "Belgi olib tashlandi", "ok");
      setCenters((cs) => cs!.map((x) => (x.id === c.id ? { ...x, verified: on, verifiedMs: on ? Date.now() : null } : x)));
    } catch (e) {
      console.error(e);
      showToast("Saqlanmadi (ruxsat yoki internet)", "error");
    } finally {
      setBusyId(null);
    }
  };

  const markPaid = async (c: AdminCenter) => {
    if (!api) return;
    const b = billingOf(c);
    if (!confirm(`«${clean(c.name)}»: ${fmtSum(b.price)} to‘lov qabul qilindimi? Muddat 1 oyga uzaytiriladi.`)) return;
    setBusyId(c.id);
    try {
      const until = await api.markPaid(c, 1);
      haptic.success();
      showToast(`To‘lov qayd etildi — ${fmtDate(until)} gacha`, "ok");
      setCenters((cs) => cs!.map((x) => (x.id === c.id ? { ...x, paidUntilMs: until } : x)));
    } catch (e) {
      console.error(e);
      showToast("Saqlanmadi (ruxsat yoki internet)", "error");
    } finally {
      setBusyId(null);
    }
  };

  const filteredCenters = useMemo(() => {
    const q = cq.trim().toLowerCase();
    return (centers ?? [])
      .filter((c) => (cf === "pending" ? !c.approved : cf === "approved" ? c.approved : cf === "vip" ? c.vip : cf === "overdue" ? c.approved && !!c.ownerTgId && billingOf(c).state === "overdue" : cf === "ownerless" ? !c.ownerTgId : true))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q) || (c.ownerUsername ?? "").toLowerCase().includes(q))
      .sort((a, b) => Number(a.approved) - Number(b.approved) || b.createdMs - a.createdMs);
  }, [centers, cq, cf]);

  const filteredApps = useMemo(() => {
    const q = aq.trim().toLowerCase();
    return periodApps.filter((a) => (af === "all" || a.status === af) && (!q || `${a.name} ${a.phone} ${a.centerName} ${a.group}`.toLowerCase().includes(q)));
  }, [periodApps, aq, af]);

  const exportCsv = async () => {
    const head = ["Sana", "Markaz", "Guruh", "Ism", "Telefon", "Telegram", "Holat"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filteredApps.map((a) => [new Date(a.createdMs).toLocaleString("uz-UZ"), clean(a.centerName), a.group, a.name, a.phone, a.tgUsername ? `@${a.tgUsername}` : "", STATUS_META[a.status].label]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map((c) => esc(String(c))).join(",")).join("\n");
    if (inTelegram) {
      // Telegram ichida fayl yuklab olish cheklangan — buferga nusxalaymiz (Excel/Sheets’ga qo‘yiladi)
      try {
        await navigator.clipboard.writeText(csv);
        showToast(`${rows.length} ta ariza nusxalandi — Excel yoki Google Sheets’ga qo‘ying`, "ok");
      } catch {
        showToast("Nusxalab bo‘lmadi", "error");
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `yaqindars-arizalar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ---------- ruxsat ---------- */
  if (!backend)
    return (
      <div className="min-h-full bg-bg pt-20">
        <SkeletonList count={4} />
      </div>
    );
  if (!api)
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-bg px-6" style={{ minHeight: "var(--vh)" }}>
        <EmptyState
          kind="search"
          title="Faqat admin uchun"
          text={inTelegram ? "Bu panel faqat ADMIN_IDS dagi foydalanuvchilar uchun. Botda /admin buyrug‘i orqali oching." : "Admin panel Telegram ichida ishlaydi: botga /admin yozing."}
          action={{ label: "Ilovaga o‘tish", onClick: goMainApp }}
        />
      </div>
    );

  const TABS: { id: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: "overview", label: "Umumiy", icon: <BarChart3 size={18} /> },
    { id: "analytics", label: "Analitika", icon: <TrendingUp size={18} /> },
    { id: "centers", label: "Markazlar", icon: <Building2 size={18} />, badge: stats.pending.length },
    { id: "apps", label: "Arizalar", icon: <ClipboardList size={18} /> },
    { id: "logs", label: "Xatolar", icon: <AlertTriangle size={18} />, badge: stats.errors24 }
  ];

  return (
    <div className="scroll-y bg-bg" style={{ height: "var(--vh)" }}>
      <div className="mx-auto flex max-w-[1240px] gap-6 px-4 pb-16 lg:px-6" style={{ paddingTop: "calc(14px + var(--safe-top))" }}>
        {/* Yon menyu (keng ekranda) */}
        <aside className="sticky top-4 hidden h-fit w-[210px] shrink-0 lg:block">
          <div className="mb-5 flex items-center gap-2 px-2">
            <LogoMark size={26} />
            <span className="text-headline">YaqinDars · Admin</span>
          </div>
          <nav className="space-y-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`focus-ring flex h-11 w-full items-center gap-3 rounded-[12px] px-3 text-left text-subhead font-medium ${tab === t.id ? "bg-tint text-white" : "text-ink hover:bg-fill"}`}
              >
                {t.icon}
                <span className="flex-1">{t.label}</span>
                {!!t.badge && <span className={`tnum rounded-full px-2 text-caption ${tab === t.id ? "bg-white/25" : "bg-[var(--st-warning)] text-[#3D2E00]"}`}>{t.badge}</span>}
              </button>
            ))}
          </nav>
          <button onClick={goMainApp} className="mt-6 px-3 text-footnote text-tint">
            ← Ilovaga o‘tish
          </button>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Sarlavha va filtrlar — bitta qatorda */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 lg:hidden">
              <LogoMark size={22} />
              <span className="text-headline">Admin</span>
            </div>
            <h1 className="hidden text-title lg:block">{TABS.find((t) => t.id === tab)?.label}</h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="w-[210px]">
                <Segmented
                  label="Davr"
                  value={days}
                  onChange={setDays}
                  options={[
                    { value: "7", label: "7 kun" },
                    { value: "30", label: "30 kun" },
                    { value: "90", label: "90 kun" }
                  ]}
                />
              </div>
              <Button size="md" kind="green" onClick={() => setQuickOpen(true)}>
                <Plus size={17} aria-hidden /> <span className="hidden sm:inline">Markaz qo‘shish</span>
              </Button>
              <button aria-label="Yangilash" onClick={load} className="focus-ring pressable flex h-9 w-9 items-center justify-center rounded-full bg-card text-tint shadow-card">
                <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Tablar (mobil) */}
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 lg:hidden">
            {TABS.map((t) => (
              <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
                {!!t.badge && <span className="tnum rounded-full bg-[var(--st-warning)] px-1.5 text-caption text-[#3D2E00]">{t.badge}</span>}
              </Chip>
            ))}
          </div>

          {centers === null ? (
            <SkeletonList count={4} />
          ) : tab === "overview" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                <Kpi icon={<Building2 size={15} />} label="Markazlar" value={stats.approved} sub={`jami ${stats.total} · VIP ${stats.vip}`} />
                <Kpi icon={<Hourglass size={15} />} label="Tasdiq kutmoqda" value={stats.pending.length} tone="var(--st-warning)" alert={stats.pending.length > 0} sub={stats.pending.length ? "pastda navbat" : "navbat bo‘sh"} />
                <Kpi icon={<Wallet size={15} />} label="Oylik daromad (taxm.)" value={fmtSum(stats.mrr).replace(" so‘m", "")} sub="so‘m · birinchi oy bepul hisobga olinmagan" tone="var(--st-good)" />
                <Kpi icon={<Banknote size={15} />} label="To‘lov muddati o‘tgan" value={stats.overdue.length} tone="var(--st-critical)" alert={stats.overdue.length > 0} sub={stats.overdue.length ? "Markazlar → «Muddati o‘tgan»" : "hammasi to‘langan"} />
                <Kpi icon={<ClipboardList size={15} />} label={`Arizalar (${days} kun)`} value={periodApps.length} sub={`bugun ${stats.today}`} />
                <Kpi icon={<CheckCircle2 size={15} />} label="Qabul darajasi" value={stats.rate === null ? "—" : `${stats.rate}%`} sub="qabul / (qabul + rad)" tone="var(--st-good)" />
                <Kpi icon={<Sparkles size={15} />} label="AI savollar (24 s)" value={counts.ai24h} />
                <Kpi icon={<MessageCircle size={15} />} label="Chatlar" value={counts.chats} sub={`navbatda ${counts.waitlist}`} />
                <Kpi icon={<AlertTriangle size={15} />} label="Xatolar (24 s)" value={stats.errors24} tone="var(--st-critical)" alert={stats.errors24 > 5} />
              </div>

              {stats.pending.length > 0 && (
                <Card title={`Tasdiqlash navbati · ${stats.pending.length}`}>
                  <div className="space-y-2.5">
                    {stats.pending.map((c) => (
                      <CenterRow key={c.id} c={c} appsCount={appsByCenter.get(c.id) ?? 0} busy={busyId === c.id} onSet={(st, vip) => setCenter(c, st, vip)} onPaid={() => markPaid(c)} onVerify={() => verify(c)} />
                    ))}
                  </div>
                </Card>
              )}

              <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
                <Card title="Kunlik arizalar" right={<span className="tnum text-footnote text-ink3">jami {periodApps.length}</span>}>
                  <BarChart data={daily} labelEvery={days === "7" ? 1 : days === "30" ? 7 : 15} />
                  <TableView head={["Kun", "Arizalar"]} rows={daily.map((d) => [d.label, d.value])} />
                </Card>
                <Card title="Ariza holatlari">
                  <StatusBars data={(Object.keys(STATUS_META) as AppStatus[]).map((k) => ({ key: k, ...STATUS_META[k], value: stats.by(k) }))} />
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card title="Eng ko‘p so‘ralgan fanlar">
                  <HBars data={topSubjects} />
                </Card>
                <Card title="Eng ko‘p ariza olgan markazlar">
                  <HBars data={topCenters} />
                </Card>
              </div>
            </div>
          ) : tab === "analytics" ? (
            <div className="space-y-4">
              <Card title={`Voronka · ${days} kun`} right={<span className="text-footnote text-ink3">qurilma/kun bo‘yicha</span>}>
                <HBars
                  data={[
                    { key: "open", label: "Ilova ochildi", value: funnel.open },
                    { key: "view", label: "Markaz ko‘rildi", value: funnel.view },
                    { key: "apply", label: "Ariza yuborildi", value: funnel.apply },
                    { key: "accept", label: "Qabul qilindi", value: funnel.accept }
                  ]}
                />
                <div className="tnum mt-3 grid grid-cols-3 gap-2 text-center text-footnote">
                  {(
                    [
                      [pct(funnel.view, funnel.open), "ochildi → ko‘rdi"],
                      [pct(funnel.apply, funnel.view), "ko‘rdi → ariza"],
                      [pct(funnel.accept, funnel.apply), "ariza → qabul"]
                    ] as const
                  ).map(([v, l]) => (
                    <div key={l} className="rounded-[12px] bg-card2 p-2">
                      <div className="text-headline">{v}</div>
                      <div className="text-ink2">{l}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Ilova ochilishi — kunlar bo‘yicha" right={<span className="tnum text-footnote text-ink3">jami {funnel.open}</span>}>
                <BarChart data={funnelDaily.map((d) => ({ key: d.date, label: d.label, value: d.open }))} labelEvery={days === "7" ? 1 : days === "30" ? 7 : 15} />
                <TableView head={["Kun", "Ochildi", "Ko‘rildi", "Ariza", "Qabul"]} rows={funnelDaily.map((d) => [d.label, d.open, d.view, d.apply, d.accept])} />
              </Card>

              <Card title="Manbalar" right={<span className="text-footnote text-ink3">/link kanal · markaz QR’i</span>}>
                {sourceRows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-subhead">
                      <thead>
                        <tr className="text-left text-footnote text-ink2">
                          <th className="py-2 pr-3 font-semibold">Manba</th>
                          <th className="py-2 pr-3 text-right font-semibold">Foydalanuvchi</th>
                          <th className="py-2 pr-3 text-right font-semibold">Ariza</th>
                          <th className="py-2 text-right font-semibold">Konversiya</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceRows.map((x) => (
                          <tr key={x.source} className="[box-shadow:inset_0_0.5px_0_var(--sep)]">
                            <td className="py-2.5 pr-3 font-medium">{x.label}</td>
                            <td className="tnum py-2.5 pr-3 text-right">{x.users}</td>
                            <td className="tnum py-2.5 pr-3 text-right">{x.apps}</td>
                            <td className="tnum py-2.5 text-right text-ink2">{pct(x.apps, x.users)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState kind="search" text="Hali manba yo‘q. Botda /link flyer bilan kampaniya havolasini yarating." />
                )}
              </Card>

              <Card
                title={`Yangilanmagan markazlar · ${STALE_DAYS}+ kun`}
                right={
                  <Button size="md" kind="tinted" disabled={!stale.length} loading={reminding} onClick={remindAll}>
                    <BellRing size={17} aria-hidden /> Hammasiga eslatma ({stale.length})
                  </Button>
                }
              >
                {stale.length ? (
                  <ul className="space-y-2">
                    {stale.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 rounded-[12px] bg-card2 px-3 py-2.5">
                        <span className="min-w-0 truncate text-subhead font-medium">{clean(c.name)}</span>
                        <span className="tnum shrink-0 text-footnote text-ink2">{c.updatedMs ? `${Math.floor((Date.now() - c.updatedMs) / DAY)} kun oldin` : "hech qachon"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState kind="search" title="Hammasi yangi" text={`${STALE_DAYS} kundan eski ma’lumotli markaz yo‘q`} />
                )}
              </Card>
            </div>
          ) : tab === "centers" ? (
            <Card>
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
                <label className="flex h-10 flex-1 items-center gap-2 rounded-[10px] bg-fill px-3">
                  <Search size={17} className="text-ink2" aria-hidden />
                  <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Nomi, manzil yoki @egasi" className="h-full flex-1 bg-transparent text-body outline-none placeholder:text-ink3" aria-label="Markaz qidirish" />
                </label>
                <div className="no-scrollbar flex gap-2 overflow-x-auto">
                  {(
                    [
                      ["all", `Hammasi ${centers.length}`],
                      ["pending", `Kutilmoqda ${stats.pending.length}`],
                      ["approved", `Tasdiqlangan ${stats.approved}`],
                      ["vip", `VIP ${stats.vip}`],
                      ["overdue", `Muddati o‘tgan ${stats.overdue.length}`],
                      ["ownerless", `Egasiz ${stats.ownerless}`]
                    ] as const
                  ).map(([k, l]) => (
                    <Chip key={k} active={cf === k} onClick={() => setCf(k)}>
                      {l}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-2.5">
                {filteredCenters.length ? (
                  filteredCenters.map((c) => <CenterRow key={c.id} c={c} appsCount={appsByCenter.get(c.id) ?? 0} busy={busyId === c.id} onSet={(st, vip) => setCenter(c, st, vip)} onPaid={() => markPaid(c)} onVerify={() => verify(c)} />)
                ) : (
                  <EmptyState kind="search" text="Bu filtr bo‘yicha markaz yo‘q" />
                )}
              </div>
            </Card>
          ) : tab === "apps" ? (
            <Card>
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center">
                <label className="flex h-10 flex-1 items-center gap-2 rounded-[10px] bg-fill px-3">
                  <Search size={17} className="text-ink2" aria-hidden />
                  <input value={aq} onChange={(e) => setAq(e.target.value)} placeholder="Ism, telefon, markaz yoki fan" className="h-full flex-1 bg-transparent text-body outline-none placeholder:text-ink3" aria-label="Ariza qidirish" />
                </label>
                <div className="no-scrollbar flex gap-2 overflow-x-auto">
                  <Chip active={af === "all"} onClick={() => setAf("all")}>
                    Hammasi
                  </Chip>
                  {(Object.keys(STATUS_META) as AppStatus[]).map((k) => (
                    <Chip key={k} active={af === k} onClick={() => setAf(k)}>
                      {STATUS_META[k].label} {stats.by(k)}
                    </Chip>
                  ))}
                </div>
                <Button kind="tinted" size="md" onClick={exportCsv}>
                  <Download size={17} aria-hidden /> {inTelegram ? "CSV nusxalash" : "CSV yuklab olish"}
                </Button>
              </div>
              {filteredApps.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-subhead">
                    <thead>
                      <tr className="text-left text-footnote text-ink2">
                        <th className="py-2 pr-3 font-semibold">Sana</th>
                        <th className="py-2 pr-3 font-semibold">Markaz · guruh</th>
                        <th className="py-2 pr-3 font-semibold">Ota-ona</th>
                        <th className="py-2 pr-3 font-semibold">Telefon</th>
                        <th className="py-2 font-semibold">Holat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApps.slice(0, 300).map((a) => {
                        const st = STATUS_META[a.status];
                        return (
                          <tr key={a.id} className="[box-shadow:inset_0_0.5px_0_var(--sep)]">
                            <td className="tnum whitespace-nowrap py-2.5 pr-3 text-ink2">{fmtListTime(a.createdMs)}</td>
                            <td className="py-2.5 pr-3">
                              <div className="font-medium">{clean(a.centerName)}</div>
                              <div className="text-footnote text-ink3">{a.group}</div>
                            </td>
                            <td className="py-2.5 pr-3">
                              {a.name}
                              {a.tgUsername && (
                                <button className="ml-1 text-footnote text-tint" onClick={() => openTelegramLink(`https://t.me/${a.tgUsername}`)}>
                                  @{a.tgUsername}
                                </button>
                              )}
                            </td>
                            <td className="tnum whitespace-nowrap py-2.5 pr-3">
                              <a href={`tel:${a.phone}`} className="text-tint">
                                {a.phone}
                              </a>
                            </td>
                            <td className="py-2.5">
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-footnote">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: `${st.color}22`, color: st.color }} aria-hidden>
                                  {st.icon}
                                </span>
                                {st.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredApps.length > 300 && <p className="mt-2 text-footnote text-ink3">Birinchi 300 tasi ko‘rsatildi — to‘liq ro‘yxat CSV’da.</p>}
                </div>
              ) : (
                <EmptyState kind="applications" text="Bu filtr bo‘yicha ariza yo‘q" />
              )}
            </Card>
          ) : (
            <Card title="Oxirgi xatolar" right={<span className="text-footnote text-ink3">90 kun saqlanadi</span>}>
              {logs.length ? (
                <ul className="space-y-2">
                  {logs.map((l) => (
                    <li key={l.id} className="rounded-[12px] bg-card2 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-footnote text-ink2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 font-semibold text-ink">
                          {l.source === "bot" ? <Bot size={13} aria-hidden /> : <ListOrdered size={13} aria-hidden />}
                          {l.source === "bot" ? "Bot" : "Web"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={13} aria-hidden /> {fmtListTime(l.createdMs)}
                        </span>
                        {l.screen && <span>· {l.screen}</span>}
                      </div>
                      <p className="mt-1.5 break-words font-mono text-footnote">{l.message}</p>
                      {l.device && <p className="mt-1 truncate text-caption text-ink3">{l.device}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState kind="search" title="Xato yo‘q" text="Hozircha ilova va bot xatosiz ishlayapti" />
              )}
            </Card>
          )}
        </main>
      </div>
      <QuickAddSheet
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSaved={(id, name) => {
          setQuickOpen(false);
          haptic.success();
          showToast(`«${name}» xaritaga qo‘shildi. Egasi uchun kod: botda /claimcode ${id}`, "ok");
          load();
        }}
      />
      <OfflineBanner />
    </div>
  );
}
