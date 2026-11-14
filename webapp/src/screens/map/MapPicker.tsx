/* Xaritadan nuqta tanlash: markazdagi pin qimirlamaydi, xarita suriladi (Yandex/Uber uslubi). */
import "leaflet/dist/leaflet.css";
import { motion } from "framer-motion";
import { LocateFixed } from "lucide-react";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { PIN_PATH } from "../../components/brand";
import { Spinner } from "../../components/ios/Spinner";
import type { LatLng } from "../../lib/types";
import { useApp } from "../../store/app";

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTR = "© OpenStreetMap";

function Tracker({ onMove, onDrag }: { onMove: (p: LatLng) => void; onDrag: (d: boolean) => void }) {
  const map = useMap();
  useEffect(() => {
    // Sheet animatsiyasidan keyin o‘lchamni qayta hisoblash
    const t = setTimeout(() => map.invalidateSize(), 350);
    return () => clearTimeout(t);
  }, [map]);
  useMapEvents({
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
      {locating ? <Spinner size={18} /> : <LocateFixed size={20} />}
    </button>
  );
}

export default function MapPicker({ initial, onChange }: { initial: LatLng; onChange: (p: LatLng) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div className="relative isolate h-full w-full overflow-hidden rounded-card">
      <MapContainer center={[initial.lat, initial.lng]} zoom={16} zoomControl={false} className="h-full w-full">
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={19} />
        <Tracker onMove={onChange} onDrag={setDragging} />
        <LocateBtn />
      </MapContainer>
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full" aria-hidden>
        <motion.svg width={34} height={41} viewBox="0 0 100 120" animate={{ y: dragging ? -10 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 25 }}>
          <path d={PIN_PATH} fill="#1E6FD9" stroke="#fff" strokeWidth={6} />
          <circle cx="50" cy="46" r="18" fill="#fff" />
        </motion.svg>
      </div>
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[499] h-1.5 w-3 -translate-x-1/2 rounded-full bg-black/30"
        animate={{ scale: dragging ? 0.6 : 1, opacity: dragging ? 0.4 : 0.8 }}
        aria-hidden
      />
    </div>
  );
}
