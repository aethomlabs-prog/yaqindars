/* Xaritadan nuqta tanlash: markazdagi pin qimirlamaydi, xarita suriladi (Yandex/Uber uslubi). */
import "leaflet/dist/leaflet.css";
import { LocateFixed } from "lucide-react";
import { useEffect, useState } from "react";
import { MapContainer, useMap, useMapEvents } from "react-leaflet";
import { PIN_PATH } from "../../components/brand";
import type { LatLng } from "../../lib/types";
import { useApp } from "../../store/app";
import { BaseTiles, LayerToggle, MeMarker, useBaseLayer, useMapAutoSize } from "./layers";


function Tracker({ onMove, onDrag, onUserMove, follow }: { onMove: (p: LatLng) => void; onDrag: (d: boolean) => void; onUserMove?: () => void; follow?: LatLng | null }) {
  const map = useMap();
  useMapAutoSize(); // sheet animatsiyasi, Telegram viewport o‘zgarishlari
  // Foydalanuvchi hali pinni surmagan bo‘lsa — GPS topilganda o‘sha joyga uchamiz
  useEffect(() => {
    if (follow) map.flyTo([follow.lat, follow.lng], 17, { duration: 0.6 });
  }, [follow?.lat, follow?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  useMapEvents({
    dragstart: () => onUserMove?.(),
    movestart: () => onDrag(true),
    moveend: () => {
      onDrag(false);
      const c = map.getCenter();
      onMove({ lat: c.lat, lng: c.lng });
    }
  });
  return null;
}

function LocateBtn() {
  const map = useMap();
  const locate = useApp((s) => s.locate);
  const locating = useApp((s) => s.locating);
  return (
    <button
      type="button"
      aria-label="Joriy joylashuv"
      onClick={async () => {
        const p = await locate(true);
        if (p) map.flyTo([p.lat, p.lng], 17, { duration: 0.6 });
      }}
      className="focus-ring absolute bottom-3 right-3 z-[500] flex h-11 w-11 items-center justify-center rounded-full bg-card text-tint shadow-float pressable"
    >
      {locating ? <span className="app-busy" aria-label="Aniqlanmoqda"><i /><i /><i /></span> : <LocateFixed size={20} />}
    </button>
  );
}

export default function MapPicker({
  initial,
  onChange,
  onUserMove,
  follow
}: {
  initial: LatLng;
  onChange: (p: LatLng) => void;
  onUserMove?: () => void;
  follow?: LatLng | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [layer, setLayer] = useBaseLayer();
  const userPos = useApp((s) => s.userPos);
  const userAcc = useApp((s) => s.userAcc);
  return (
    <div className="relative isolate h-full w-full overflow-hidden rounded-card">
      <MapContainer center={[initial.lat, initial.lng]} zoom={16} zoomControl={false} className="h-full w-full">
        <BaseTiles layer={layer} />
        {userPos && <MeMarker pos={userPos} acc={userAcc} />}
        <Tracker onMove={onChange} onDrag={setDragging} onUserMove={onUserMove} follow={follow} />
        <LocateBtn />
      </MapContainer>
      <LayerToggle layer={layer} onChange={setLayer} className="absolute left-3 top-3 z-[500] !h-9 !px-3" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full" aria-hidden>
        <svg width={34} height={41} viewBox="0 0 100 120" style={{ transform: `translateY(${dragging ? -10 : 0}px)`, transition: "transform .3s var(--yd-spring)" }}>
          <path d={PIN_PATH} fill="#1E6FD9" stroke="#fff" strokeWidth={6} />
          <circle cx="50" cy="46" r="18" fill="#fff" />
        </svg>
      </div>
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[499] h-1.5 w-3 -translate-x-1/2 rounded-full bg-black/30"
        style={{ scale: dragging ? "0.6" : "1", opacity: dragging ? 0.4 : 0.8, transition: "scale .3s, opacity .3s" }}
        aria-hidden
      />
    </div>
  );
}
