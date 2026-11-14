import type * as Leaflet from "leaflet";
import { PIN } from "./shared";

/**
 * 4. Jonli xarita markerlari.
 *   free — bo‘sh joy bor (moviy, yashil to‘lqin), full — joy yo‘q (kulrang), vip — oltin yaltiroq.
 *   L.marker(latlng, { icon: pinIcon(L, "free") })
 *   markerClusterGroup({ iconCreateFunction: c => clusterIcon(L, c.getChildCount()) })
 */
export type PinState = "free" | "full" | "vip";

export function pinIcon(L: typeof Leaflet, state: PinState, selected = false): Leaflet.DivIcon {
  const w = state === "vip" ? 38 : 32;
  const h = Math.round(w * 1.2);
  return L.divIcon({
    className: `yd-pin yd-pin-${state}${selected ? " is-sel" : ""}`,
    html:
      `<span class="yd-pin-ring"></span>` +
      `<svg viewBox="0 0 100 120" width="${w}" height="${h}" aria-hidden="true">` +
      `<path d="${PIN}"/><circle cx="50" cy="46" r="19" fill="#fff"/></svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
}

export function clusterIcon(L: typeof Leaflet, count: number): Leaflet.DivIcon {
  const s = count < 10 ? 40 : count < 50 ? 48 : 56;
  return L.divIcon({
    className: "yd-cluster",
    html: `<span>${count}</span>`,
    iconSize: [s, s],
  });
}
