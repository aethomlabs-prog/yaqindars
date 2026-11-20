/* 31 ta fan — ilova, veb, filtrlar, ro'yxatdan o'tish va Functions shu ro'yxatdan foydalanadi.
 * icon — lucide ikonka nomi (har platforma o'zi chizadi), color — brend palitrasidan. "Boshqa" doim oxirida. */
export interface SubjectMeta {
  name: string;
  icon: string;
  color: string;
}

export const SUBJECT_META: SubjectMeta[] = [
  { name: "Ingliz tili", icon: "Languages", color: "#1E6FD9" },
  { name: "IELTS", icon: "Award", color: "#B91C1C" },
  { name: "CEFR", icon: "Medal", color: "#0369A1" },
  { name: "SAT", icon: "Trophy", color: "#A16207" },
  { name: "Matematika", icon: "Sigma", color: "#7C3AED" },
  { name: "IT", icon: "Monitor", color: "#0E7490" },
  { name: "Rus tili", icon: "BookOpen", color: "#C2410C" },
  { name: "Ona tili", icon: "PenLine", color: "#B45309" },
  { name: "Kimyo", icon: "FlaskConical", color: "#13804F" },
  { name: "Biologiya", icon: "Leaf", color: "#4D7C0F" },
  { name: "Fizika", icon: "Atom", color: "#0F3D7A" },
  { name: "Tarix", icon: "Landmark", color: "#92400E" },
  { name: "Geografiya", icon: "Globe", color: "#047857" },
  { name: "Huquq", icon: "Scale", color: "#4338CA" },
  { name: "Iqtisodiyot", icon: "Coins", color: "#A16207" },
  { name: "Nemis tili", icon: "MessagesSquare", color: "#1F2937" },
  { name: "Koreys tili", icon: "MessagesSquare", color: "#BE185D" },
  { name: "Turk tili", icon: "MessagesSquare", color: "#DC2626" },
  { name: "Arab tili", icon: "MessagesSquare", color: "#15803D" },
  { name: "Xitoy tili", icon: "MessagesSquare", color: "#B91C1C" },
  { name: "Fransuz tili", icon: "MessagesSquare", color: "#1D4ED8" },
  { name: "DTM / Abituriyent", icon: "GraduationCap", color: "#0F3D7A" },
  { name: "Robototexnika", icon: "Bot", color: "#0E7490" },
  { name: "Mental arifmetika", icon: "Calculator", color: "#7C3AED" },
  { name: "Maktabga tayyorlov", icon: "Baby", color: "#DB2777" },
  { name: "Boshlang‘ich sinf", icon: "Backpack", color: "#C2410C" },
  { name: "Rasm", icon: "Palette", color: "#9333EA" },
  { name: "Musiqa", icon: "Music", color: "#BE123C" },
  { name: "Sport", icon: "Dumbbell", color: "#B93A1E" },
  { name: "Shaxmat", icon: "Crown", color: "#374151" },
  { name: "Boshqa", icon: "LayoutGrid", color: "#6B7280" }
];

export const SUBJECTS: string[] = SUBJECT_META.map((s) => s.name);

/** Bosh sahifada birinchi ko'rinadigan fanlar, qolganlari «Hammasi» ostida */
export const HOME_SUBJECTS = ["Ingliz tili", "IELTS", "CEFR", "SAT", "Matematika", "IT", "Rus tili"];

export const subjectMeta = (name: string): SubjectMeta => SUBJECT_META.find((s) => s.name === name) ?? SUBJECT_META[SUBJECT_META.length - 1];
