/* Xarita asosi: oddiy (OpenStreetMap) yoki Sputnik (Esri World Imagery + nomlar). Tanlov eslab qolinadi. */
import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { Circle, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import { haptic } from "../../lib/telegram";
import type { LatLng } from "../../lib/types";

export type BaseLayer = "map" | "sat";
const KEY = "yd-map-layer";
const listeners = new Set<(l: BaseLayer) => void>();

function read(): BaseLayer {
  try {
    return localStorage.getItem(KEY) === "sat" ? "sat" : "map";
  } catch {
    return "map";
  }
}

export function useBaseLayer(): [BaseLayer, (l: BaseLayer) => void] {
  const [layer, setLayer] = useState<BaseLayer>(read);
  useEffect(() => {
    listeners.add(setLayer);
    return () => void listeners.delete(setLayer);
  }, []);
  const set = (l: BaseLayer) => {
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* private rejim */
    }
    listeners.forEach((fn) => fn(l));
  };
  return [layer, set];
}

export function BaseTiles({ layer }: { layer: BaseLayer }) {
  if (layer === "sat")
    return (
      <>
        <TileLayer
          key="sat"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Sputnik © Esri, Maxar"
          maxZoom={19}
          maxNativeZoom={18}
          className="yd-sat"
        />
        <TileLayer
          key="sat-labels"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
          maxZoom={19}
          maxNativeZoom={18}
          className="yd-sat"
        />
      </>
    );
  return <TileLayer key="map" url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" maxZoom={19} />;
}

export function LayerToggle({ layer, onChange, className = "" }: { layer: BaseLayer; onChange: (l: BaseLayer) => void; className?: string }) {
  const sat = layer === "sat";
  return (
    <button
      type="button"
      aria-label={sat ? "Oddiy xaritaga o‘tish" : "Sputnik ko‘rinishiga o‘tish"}
      aria-pressed={sat}
      onClick={() => {
        haptic.selection();
        onChange(sat ? "map" : "sat");
      }}
      className={`focus-ring pressable flex h-11 items-center gap-1.5 rounded-full bg-card px-3.5 text-subhead font-medium text-ink shadow-float ${className}`}
    >
      <Layers size={18} className="text-tint" aria-hidden />
      {sat ? "Xarita" : "Sputnik"}
    </button>
  );
}

const meIcon = L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

/** Foydalanuvchi nuqtasi + aniqlik doirasi (GPS qanchalik aniq ekanini ko‘rsatadi) */
export function MeMarker({ pos, acc }: { pos: LatLng; acc: number | null }) {
  return (
    <>
      {acc != null && acc > 8 && acc < 3000 && (
        <Circle center={[pos.lat, pos.lng]} radius={acc} interactive={false} pathOptions={{ color: "#1E6FD9", weight: 1, opacity: 0.5, fillColor: "#1E6FD9", fillOpacity: 0.1 }} />
      )}
      <Marker position={[pos.lat, pos.lng]} icon={meIcon} interactive={false} zIndexOffset={2000} title="Siz shu yerdasiz" />
    </>
  );
}
