/* Brend: logo belgisi, fan ikonkalari, pin marker. */
import { Atom, BookOpen, Crown, Dumbbell, FlaskConical, Languages, LayoutGrid, Leaf, Monitor, PenLine, Sigma, type LucideIcon } from "lucide-react";

export const PIN_PATH = "M50 4 C26 4 8 22 8 46 C8 76 50 116 50 116 C50 116 92 76 92 46 C92 22 74 4 50 4 Z";

export function LogoMark({ size = 32, color = "#1E6FD9" }: { size?: number; color?: string }) {
  return (
    <svg width={(size * 100) / 120} height={size} viewBox="0 0 100 120" aria-hidden>
      <path d={PIN_PATH} fill={color} />
      <circle cx="50" cy="46" r="27" fill="#fff" />
      <path d="M33 37 Q41 32 49 37.5 L49 58 Q41 53 33 57 Z" fill={color} />
      <path d="M67 37 Q59 32 51 37.5 L51 58 Q59 53 67 57 Z" fill={color} />
      <circle cx="80" cy="16" r="10" fill="#22B573" />
    </svg>
  );
}

export interface SubjectMeta {
  name: string;
  icon: LucideIcon;
  color: string;
}

export const SUBJECT_META: SubjectMeta[] = [
  { name: "Ingliz tili", icon: Languages, color: "#1E6FD9" },
  { name: "Matematika", icon: Sigma, color: "#7C3AED" },
  { name: "IT", icon: Monitor, color: "#0E7490" },
  { name: "Rus tili", icon: BookOpen, color: "#C2410C" },
  { name: "Kimyo", icon: FlaskConical, color: "#13804F" },
  { name: "Biologiya", icon: Leaf, color: "#4D7C0F" },
  { name: "Fizika", icon: Atom, color: "#0F3D7A" },
  { name: "Ona tili", icon: PenLine, color: "#B45309" },
  { name: "Sport", icon: Dumbbell, color: "#B93A1E" },
  { name: "Shaxmat", icon: Crown, color: "#374151" },
  { name: "Boshqa", icon: LayoutGrid, color: "#6B7280" }
];

export const subjectMeta = (name: string): SubjectMeta => SUBJECT_META.find((s) => s.name === name) ?? SUBJECT_META[SUBJECT_META.length - 1];

export function SubjectIcon({ name, size = 44 }: { name: string; size?: number }) {
  const m = subjectMeta(name);
  const Icon = m.icon;
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[14px]" style={{ width: size, height: size, background: `${m.color}1A`, color: m.color }} aria-hidden>
      <Icon size={size * 0.48} strokeWidth={1.9} />
    </span>
  );
}
