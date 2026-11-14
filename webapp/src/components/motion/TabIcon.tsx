import { PIN } from "./shared";

/**
 * 6. Tab bar ikonkalari — tanlanganda bir marta jonlanadi.
 * <TabIcon id="map" active={tab === "map"} />
 */
export type TabId = "home" | "map" | "chat" | "profile";

function Paths({ id }: { id: TabId }) {
  switch (id) {
    case "home":
      return <path d="M4 11l8-7 8 7v8a2 2 0 0 1-2 2h-3v-6H9v6H6a2 2 0 0 1-2-2z" />;
    case "map":
      return (
        <g transform="translate(4.5 2) scale(.15)">
          <path d={PIN} strokeWidth="13" />
          <circle cx="50" cy="46" r="15" strokeWidth="13" />
        </g>
      );
    case "chat":
      return <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />;
    default:
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </>
      );
  }
}

export default function TabIcon({ id, active }: { id: TabId; active: boolean }) {
  return (
    <svg
      key={active ? "on" : "off"}
      className={`yd-tab yd-tab-${id}${active ? " is-active" : ""}`}
      viewBox="0 0 24 24"
      width="26"
      height="26"
      aria-hidden="true"
    >
      <Paths id={id} />
    </svg>
  );
}
