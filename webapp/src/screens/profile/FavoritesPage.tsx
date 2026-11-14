import { EmptyState } from "../../components/motion";
import { CenterRow } from "../../components/cards";

import { Page } from "../../components/ios/Page";
import { distanceKm } from "../../lib/geo";
import { useApp, useOrigin, useProfile } from "../../store/app";
import { useNav } from "../../store/nav";

export function FavoritesPage() {
  const favorites = useProfile((s) => s.favorites);
  const centers = useApp((s) => s.centers);
  const setTab = useNav((s) => s.setTab);
  const { pos } = useOrigin();
  const list = favorites.map((id) => centers.find((c) => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <Page title="Saqlanganlar" back backLabel="Profil">
      {list.length ? (
        <div className="mx-4 mt-3 space-y-2.5">
          {list.map((c, i) => (
            <CenterRow
              key={c.id}
              i={i}
              c={c}
              km={distanceKm(pos, c)}
              free={c.groups.reduce((s, g) => s + g.freeSeats, 0)}
              minPrice={c.groups.length ? Math.min(...c.groups.map((g) => g.price)) : 0}
              subjects={[...new Set(c.groups.map((g) => g.subject))]}
            />
          ))}
        </div>
      ) : (
        <EmptyState kind="saved" text="Yoqqan markazlarni ♡ tugmasi bilan saqlang — ular shu yerda turadi." action={{ label: "Markazlarni ko‘rish", onClick: () => setTab("home") }} />
      )}
    </Page>
  );
}
