/**
 * 3. Bo‘sh holatlar.
 * <EmptyState kind="search" action={{ label: "Filtrni tozalash", onClick: reset }} />
 */
type Kind = "search" | "applications" | "chats" | "saved";

const DEFAULTS: Record<Kind, { title: string; text: string }> = {
  search: { title: "Hech narsa topilmadi", text: "Filtrni o‘zgartirib yoki masofani kengaytirib ko‘ring" },
  applications: { title: "Hali ariza yo‘q", text: "Yoqqan guruhga bepul sinov darsiga yoziling" },
  chats: { title: "Chatlar yo‘q", text: "Markaz sahifasida «Yozish» tugmasini bosing" },
  saved: { title: "Saqlanganlar yo‘q", text: "Markazlarni ♥ bilan saqlab qo‘ying" },
};

function Art({ kind }: { kind: Kind }) {
  switch (kind) {
    case "search":
      return (
        <svg viewBox="0 0 120 100" aria-hidden="true">
          <circle cx="60" cy="50" r="40" className="yd-es-bg" />
          <g className="yd-es-float">
            <circle cx="55" cy="45" r="18" className="yd-es-line" />
            <path d="M68 58l14 14" className="yd-es-line" />
          </g>
          <circle cx="86" cy="26" r="5" className="yd-es-accent yd-es-pulse" />
        </svg>
      );
    case "applications":
      return (
        <svg viewBox="0 0 120 100" aria-hidden="true">
          <circle cx="60" cy="50" r="40" className="yd-es-bg" />
          <g className="yd-es-float">
            <rect x="40" y="24" width="40" height="52" rx="8" className="yd-es-line" />
            <path d="M50 40h20M50 50h20M50 60h12" className="yd-es-line" />
          </g>
          <circle cx="84" cy="30" r="5" className="yd-es-accent yd-es-pulse" />
        </svg>
      );
    case "chats":
      return (
        <svg viewBox="0 0 120 100" aria-hidden="true">
          <circle cx="60" cy="50" r="40" className="yd-es-bg" />
          <g className="yd-es-float">
            <path d="M32 34h36a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H48l-10 8v-8h-6a8 8 0 0 1-8-8V42a8 8 0 0 1 8-8z" className="yd-es-line" />
          </g>
          <g className="yd-es-float yd-es-late">
            <path d="M74 50h14a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6h-2v6l-8-6h-4a6 6 0 0 1-6-6" className="yd-es-line yd-es-accent-s" />
          </g>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 120 100" aria-hidden="true">
          <circle cx="60" cy="50" r="40" className="yd-es-bg" />
          <path className="yd-es-line yd-es-beat" d="M60 74S36 60 36 44a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 16-24 30-24 30z" />
        </svg>
      );
  }
}

export default function EmptyState({
  kind,
  title,
  text,
  action,
}: {
  kind: Kind;
  title?: string;
  text?: string;
  action?: { label: string; onClick: () => void };
}) {
  const d = DEFAULTS[kind];
  return (
    <div className="yd-empty" role="status">
      <div className="yd-empty-art"><Art kind={kind} /></div>
      <h3>{title ?? d.title}</h3>
      <p>{text ?? d.text}</p>
      {action && <button type="button" className="yd-btn yd-btn-ghost" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}
