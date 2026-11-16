/* Xarita tabi: Leaflet + klasterlar, tepada fan chiplari va filtr, pastda 3 balandlikli ro‘yxat. */
import "leaflet/dist/leaflet.css";
import { clusterIcon, EmptyState, pinIcon, type PinState } from "../../components/motion";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L from "leaflet";
import "leaflet.markercluster";
import { LocateFixed, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, MapContainer, Marker, useMap } from "react-leaflet";
import { CenterRow } from "../../components/cards";
import { WatchButton } from "../../components/WatchButton";
import { PIN_PATH } from "../../components/brand";
import { Chip } from "../../components/ios/controls";
import { DetentSheet } from "../../components/ios/Sheet";
import { SUBJECTS } from "../../lib/match";
import { haptic, openLocationSettings } from "../../lib/telegram";
import type { LatLng } from "../../lib/types";
import { useApp, useOrigin } from "../../store/app";
import { activeFilterCount, filterCenters, useFilters, type Visible } from "../../store/filters";
import { useNav } from "../../store/nav";
import { BaseTiles, LayerToggle, MeMarker, useBaseLayer, useMapAutoSize } from "./layers";
import { FilterSheet } from "./FilterSheet";

/* ---------- Marker ikonkalari: components/motion (jonli pinlar) ---------- */
const pinState = (v: Visible): PinState => (v.free <= 0 ? "full" : v.center.vip ? "vip" : "free");

/** Tanlangan manzil (Uy, Maktab…) — yashil pin */
const addressIcon = L.divIcon({
  className: "yd-pin",
  html: `<svg width="30" height="36" viewBox="0 0 100 120" aria-hidden="true"><path d="${PIN_PATH}" fill="#13804F" stroke="#fff" stroke-width="6"/><circle cx="50" cy="46" r="19" fill="#fff"/></svg>`,
  iconSize: [30, 36],
  iconAnchor: [15, 36]
});

/* ---------- Xarita qatlamlari ---------- */
function Markers({ list, selected, onSelect }: { list: Visible[]; selected: string | null; onSelect: (id: string) => void }) {
  const map = useMap();
  const group = useRef<L.MarkerClusterGroup | null>(null);
  const markers = useRef(new Map<string, { m: L.Marker; v: Visible }>());
  const selRef = useRef(selected);
  const cb = useRef(onSelect);
  cb.current = onSelect;

  useEffect(() => {
    const g = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 44,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (c) => clusterIcon(L, c.getChildCount())
    });
    map.addLayer(g);
    group.current = g;
    return () => {
      map.removeLayer(g);
    };
  }, [map]);

  // Ro'yxat o'zgarsa — markerlar qaytadan (pinlar «tushib» chiqadi)
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.clearLayers();
    markers.current.clear();
    const sel = selRef.current;
    g.addLayers(
      list.map((v) => {
        const m = L.marker([v.center.lat, v.center.lng], {
          icon: pinIcon(L, pinState(v), v.center.id === sel),
          title: v.center.name,
          keyboard: true,
          zIndexOffset: v.center.id === sel ? 1000 : v.center.vip ? 500 : 0
        }).on("click", () => cb.current(v.center.id));
        markers.current.set(v.center.id, { m, v });
        return m;
      })
    );
  }, [list]);

  // Tanlov o'zgarsa — faqat eski va yangi tanlangan pin yangilanadi (qolganlari qayta animatsiya qilmaydi)
  useEffect(() => {
    const prev = selRef.current;
    selRef.current = selected;
    for (const id of [prev, selected]) {
      const x = id ? markers.current.get(id) : undefined;
      if (!x) continue;
      const on = id === selected;
      x.m.setIcon(pinIcon(L, pinState(x.v), on));
      x.m.setZIndexOffset(on ? 1000 : x.v.center.vip ? 500 : 0);
    }
  }, [selected]);
  return null;
}

/** Tashqi buyruqlar: markazga uchish, o‘lchamni yangilash */
function Controller({ flyTo, sizeKey }: { flyTo: { p: LatLng; z?: number; n: number } | null; sizeKey: unknown }) {
  const map = useMap();
  useEffect(() => {
    if (flyTo) map.flyTo([flyTo.p.lat, flyTo.p.lng], flyTo.z ?? Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [flyTo, map]);
  useMapAutoSize(sizeKey);
  return null;
}

/* ---------- Ekran ---------- */
export default function MapScreen() {
  const centers = useApp((s) => s.centers);
  const status = useApp((s) => s.centersStatus);
  const userPos = useApp((s) => s.userPos);
  const userAcc = useApp((s) => s.userAcc);
  const locate = useApp((s) => s.locate);
  const watchLocation = useApp((s) => s.watchLocation);
  const [layer, setLayer] = useBaseLayer();
  const locating = useApp((s) => s.locating);
  const locStatus = useApp((s) => s.locStatus);
  const tab = useNav((s) => s.tab);
  const push = useNav((s) => s.push);
  const f = useFilters();
  const { pos, label, source } = useOrigin();

  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  const [detent, setDetent] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [flyTo, setFlyTo] = useState<{ p: LatLng; z?: number; n: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Xarita tabi ochiq paytida — joylashuvni jonli kuzatamiz (birinchi marta ruxsat so‘raladi)
  useEffect(() => {
    if (tab !== "map") return;
    if (!useApp.getState().userPos) locate(false);
    return watchLocation();
  }, [tab, locate, watchLocation]);

  // Manba o‘zgarsa (manzil tanlandi yoki GPS birinchi marta topildi) — xarita o‘sha joyga.
  // GPS har yangilanganda xarita sakramasin: faqat manba/manzil o‘zgarishida uchamiz.
  const originKey = source === "gps" ? "gps" : `${source}:${pos.lat},${pos.lng}`;
  useEffect(() => {
    setFlyTo((x) => ({ p: pos, z: source === "gps" ? 16 : 15, n: (x?.n ?? 0) + 1 }));
  }, [originKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => filterCenters(centers, f, pos), [centers, f, pos]);
  const ordered = useMemo(() => {
    if (!selected) return list;
    const s = list.find((v) => v.center.id === selected);
    return s ? [s, ...list.filter((v) => v !== s)] : list;
  }, [list, selected]);

  const detents = useMemo(() => (h ? [116, Math.round(h * 0.45), h - 120] : [116, 300, 500]), [h]);
  const nFilters = activeFilterCount(f);

  const select = (id: string) => {
    haptic.selection();
    setSelected(id);
    setDetent(1);
    const c = centers.find((x) => x.id === id);
    if (c) setFlyTo((x) => ({ p: c, n: (x?.n ?? 0) + 1 }));
  };

  return (
    <div ref={box} className="absolute inset-x-0 top-0 isolate overflow-hidden" style={{ bottom: "var(--tabbar-h)" }}>
      <MapContainer center={[pos.lat, pos.lng]} zoom={14} zoomControl={false} className="absolute inset-0 z-0" style={{ bottom: detents[0] - 24 }}>
        <BaseTiles layer={layer} />
        <Markers list={list} selected={selected} onSelect={select} />
        {userPos && <MeMarker pos={userPos} acc={userAcc} />}
        {source === "address" && <Marker position={[pos.lat, pos.lng]} icon={addressIcon} title={label} interactive={false} />}
        {f.radius && <Circle center={[pos.lat, pos.lng]} radius={f.radius * 1000} pathOptions={{ color: "#1E6FD9", weight: 1.5, fillOpacity: 0.06 }} />}
        <Controller flyTo={flyTo} sizeKey={`${h}-${tab}`} />
      </MapContainer>

      {/* Tepadagi panel: fanlar + filtr */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[600]" style={{ paddingTop: "calc(8px + var(--safe-top))" }}>
        <div className="no-scrollbar pointer-events-auto flex gap-2 overflow-x-auto px-3 pb-2">
          <button
            onClick={() => setFiltersOpen(true)}
            aria-label={`Filtrlar${nFilters ? `, ${nFilters} ta faol` : ""}`}
            className={`focus-ring pressable relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-subhead font-medium shadow-float ${nFilters ? "bg-tint text-white" : "bg-card text-ink"}`}
          >
            <SlidersHorizontal size={16} aria-hidden />
            Filtr{nFilters ? ` · ${nFilters}` : ""}
          </button>
          <Chip active={f.freeOnly} onClick={() => f.set({ freeOnly: !f.freeOnly })}>
            Bo‘sh joy
          </Chip>
          <Chip active={f.subject === null} onClick={() => f.set({ subject: null })}>
            Hammasi
          </Chip>
          {SUBJECTS.map((s) => (
            <Chip key={s} active={f.subject === s} onClick={() => f.set({ subject: f.subject === s ? null : s })}>
              {s}
            </Chip>
          ))}
        </div>
      </div>

      {/* Joylashuvga ruxsat yo‘q — xarita Rishton’da, yuqorida aniq tugma */}
      {locStatus === "denied" && !userPos && source !== "address" && (
        <div className="absolute inset-x-3 z-[600] flex justify-center" style={{ top: "calc(60px + var(--safe-top))" }}>
          <button
            onClick={async () => {
              const p = await locate(true);
              if (p) setFlyTo((x) => ({ p, z: 17, n: (x?.n ?? 0) + 1 }));
              else openLocationSettings();
            }}
            className="focus-ring pressable flex h-11 items-center gap-2 rounded-full bg-tint px-4 text-subhead font-semibold text-white shadow-float"
          >
            {locating ? <span className="app-busy" aria-label="Aniqlanmoqda"><i /><i /><i /></span> : <LocateFixed size={18} aria-hidden />} Joylashuvni yoqish
          </button>
        </div>
      )}

      {/* Xarita / Sputnik */}
      <div className="absolute right-3 z-[600]" style={{ top: locStatus === "denied" && !userPos && source !== "address" ? "calc(112px + var(--safe-top))" : "calc(60px + var(--safe-top))" }}>
        <LayerToggle layer={layer} onChange={setLayer} />
      </div>

      {/* Joylashuv tugmasi — sheet ustida suzadi */}
      <button
        aria-label="Mening joylashuvim"
        onClick={async () => {
          const p = await locate(true);
          if (p) setFlyTo((x) => ({ p, z: 17, n: (x?.n ?? 0) + 1 }));
          else openLocationSettings();
        }}
        className="focus-ring pressable absolute right-3 z-[600] flex h-11 w-11 items-center justify-center rounded-full bg-card text-tint shadow-float transition-[bottom] duration-300"
        style={{ bottom: (detent === 2 ? detents[1] : detents[detent]) + 12, opacity: detent === 2 ? 0 : 1 }}
      >
        {locating ? <span className="app-busy" aria-label="Aniqlanmoqda"><i /><i /><i /></span> : <LocateFixed size={21} />}
      </button>

      {h > 0 && (
        <DetentSheet
          detents={detents}
          index={detent}
          onIndexChange={setDetent}
          header={
            <div className="flex items-center justify-between px-5 pb-2 pt-2">
              <div>
                <div className="text-headline">{status === "loading" && !centers.length ? "Yuklanmoqda…" : `${list.length} ta markaz`}</div>
                <div className="text-footnote text-ink2">{label} atrofida</div>
              </div>
              {selected && (
                <button onClick={() => setSelected(null)} className="text-subhead text-tint">
                  Tanlovni bekor qilish
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-2.5 px-4 pb-4 pt-1">
            {ordered.map((v, i) => (
              <div key={v.center.id} className={v.center.id === selected ? "rounded-card ring-2 ring-tint" : ""}>
                <CenterRow
                  i={i}
                  c={v.center}
                  km={v.km}
                  free={v.free}
                  minPrice={v.minPrice}
                  subjects={[...new Set(v.groups.map((gi) => v.center.groups[gi].subject))]}
                  onOpen={() => push({ name: "center", centerId: v.center.id })}
                />
              </div>
            ))}
            {status === "ready" && <WatchButton className="mt-1" />}
            {status === "ready" && !list.length && (
              <EmptyState kind="search" text="Bu shartlarga mos markaz topilmadi." action={{ label: "Filtrlarni tozalash", onClick: () => {
                  f.reset();
                  f.set({ subject: null, radius: null });
                } }} />
            )}
          </div>
        </DetentSheet>
      )}

      <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} resultCount={list.length} />
    </div>
  );
}
