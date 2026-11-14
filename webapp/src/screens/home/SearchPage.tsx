/* Qidiruv: erkin matn («ingliz tili 300 minggacha shanba») → mos markazlar. */
import { Clock, Sparkles } from "lucide-react";
import { EmptyState } from "../../components/motion";
import { useMemo, useState } from "react";
import { CenterRow } from "../../components/cards";
import { SubjectIcon } from "../../components/brand";
import { SearchBar } from "../../components/ios/controls";
import { Page } from "../../components/ios/Page";
import { distanceKm } from "../../lib/geo";
import { findMatches, parseQuery, SUBJECTS } from "../../lib/match";
import { useApp, useOrigin, useProfile } from "../../store/app";
import { useNav } from "../../store/nav";

export function SearchPage() {
  const [q, setQ] = useState("");
  const centers = useApp((s) => s.centers);
  const recent = useProfile((s) => s.recentSearches);
  const addRecent = useProfile((s) => s.addRecent);
  const clearRecent = useProfile((s) => s.clearRecent);
  const push = useNav((s) => s.push);
  const { pos } = useOrigin();

  const parsed = useMemo(() => parseQuery(q), [q]);
  const results = useMemo(() => {
    if (q.trim().length < 2) return [];
    const byQuery = findMatches(centers, parsed, pos, 50);
    // Nom bo‘yicha qo‘shimcha moslik (fan topilgan bo‘lsa ham markaz nomini qidiramiz)
    const t = q.trim().toLowerCase();
    const seen = new Set(byQuery.map((m) => m.center.id));
    const byName = parsed.subject
      ? []
      : centers
          .filter((c) => !seen.has(c.id) && (c.name.toLowerCase().includes(t) || c.address.toLowerCase().includes(t)))
          .map((c) => ({ center: c, groupIndexes: c.groups.map((_, i) => i), km: distanceKm(pos, c) }));
    return [...byQuery, ...byName];
  }, [q, parsed, centers, pos]);

  const chips = [parsed.subject, parsed.maxPrice ? `≤ ${Math.round(parsed.maxPrice / 1000)} ming` : null, ...parsed.days, parsed.nearest ? "Yaqin" : null, parsed.freeOnly ? "Bo‘sh joy" : null].filter(
    Boolean
  ) as string[];

  const commit = (v: string) => {
    if (v.trim().length >= 2) addRecent(v.trim());
  };

  return (
    <Page
      title="Qidiruv"
      back
      backLabel="Asosiy"
      below={
        <div className="px-4 pb-2">
          <SearchBar value={q} onChange={setQ} autoFocus placeholder="Fan, markaz yoki ustoz" onSubmit={commit} />
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Tushunilgan shartlar">
              {chips.map((c) => (
                <span key={c} className="rounded-full bg-tint/10 px-2.5 py-1 text-caption text-tint">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      }
    >
      {q.trim().length < 2 ? (
        <>
          {recent.length > 0 && (
            <section className="mx-4 mt-3">
              <div className="mb-1 flex items-center justify-between px-1">
                <h2 className="text-headline">Oxirgi qidiruvlar</h2>
                <button onClick={clearRecent} className="text-subhead text-tint">
                  Tozalash
                </button>
              </div>
              <div className="overflow-hidden rounded-card bg-card">
                {recent.map((r) => (
                  <button key={r} onClick={() => setQ(r)} className="focus-ring flex w-full items-center gap-3 px-4 text-left active:bg-fill">
                    <Clock size={17} className="shrink-0 text-ink3" aria-hidden />
                    <span className="flex-1 truncate py-3 text-body [box-shadow:inset_0_-0.5px_0_var(--sep)]">{r}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="mx-4 mt-6">
            <h2 className="mb-2 px-1 text-headline">Fanlar</h2>
            <div className="grid grid-cols-2 gap-2">
              {SUBJECTS.filter((s) => s !== "Boshqa").map((s) => (
                <button key={s} onClick={() => setQ(s)} className="focus-ring pressable flex items-center gap-3 rounded-[16px] bg-card p-2.5 text-left">
                  <SubjectIcon name={s} size={36} />
                  <span className="truncate text-subhead font-medium">{s}</span>
                </button>
              ))}
            </div>
          </section>

          <button onClick={() => push({ name: "ai" }, "chat")} className="focus-ring pressable mx-4 mt-6 flex w-[calc(100%-32px)] items-center gap-3 rounded-card bg-card p-4 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-tint text-white" aria-hidden>
              <Sparkles size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-headline">AI yordamchidan so‘rang</span>
              <span className="block text-footnote text-ink2">«O‘g‘limga shanba kuni ingliz tili kerak»</span>
            </span>
          </button>
        </>
      ) : results.length ? (
        <div className="mx-4 mt-3 space-y-2.5" onClick={() => commit(q)}>
          <p className="px-1 text-footnote text-ink2">{results.length} ta natija</p>
          {results.map((m, i) => {
            const subjects = [...new Set(m.groupIndexes.map((gi) => m.center.groups[gi].subject))];
            return (
              <CenterRow
                key={m.center.id}
                i={i}
                c={m.center}
                km={m.km}
                free={m.groupIndexes.reduce((s, gi) => s + m.center.groups[gi].freeSeats, 0)}
                minPrice={Math.min(...m.groupIndexes.map((gi) => m.center.groups[gi].price))}
                subjects={subjects}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState kind="search" text="Narx yoki kunni olib tashlab ko‘ring" action={{ label: "Tozalash", onClick: () => setQ("") }} />
      )}
    </Page>
  );
}
