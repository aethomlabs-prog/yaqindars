/* Brend: logo belgisi, fan ikonkalari, pin marker. */
import {
  Atom,
  Award,
  Backpack,
  Baby,
  BookOpen,
  Bot,
  Calculator,
  Coins,
  Crown,
  Dumbbell,
  FlaskConical,
  Globe,
  GraduationCap,
  Landmark,
  Languages,
  LayoutGrid,
  Leaf,
  Medal,
  MessagesSquare,
  Monitor,
  Music,
  Palette,
  PenLine,
  Scale,
  Sigma,
  Trophy,
  type LucideIcon
} from "lucide-react";
import { SUBJECT_META as SHARED_SUBJECTS } from "@shared/subjects";

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

/** Fanlar ro‘yxati va ranglari — packages/shared (mobil bilan umumiy); bu yerda faqat ikonka tanlanadi */
const ICONS: Record<string, LucideIcon> = {
  Languages, Award, Medal, Trophy, Sigma, Monitor, BookOpen, PenLine, FlaskConical, Leaf, Atom, Landmark, Globe, Scale, Coins,
  MessagesSquare, GraduationCap, Bot, Calculator, Baby, Backpack, Palette, Music, Dumbbell, Crown, LayoutGrid
};
export const SUBJECT_META: SubjectMeta[] = SHARED_SUBJECTS.map((s) => ({ name: s.name, color: s.color, icon: ICONS[s.icon] ?? LayoutGrid }));

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
