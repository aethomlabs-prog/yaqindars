/* Kutubxonasiz animatsiya yordamchilari (faqat CSS, yd-motion.css keyframe’lari). */
import type { CSSProperties } from "react";

/** Ro‘yxat elementlari 30 ms kechikish bilan ketma-ket chiqadi */
export const listItem = (i: number): { style: CSSProperties } => ({
  style: { animation: `yd-rise .35s var(--yd-ease) ${Math.min(i, 12) * 30}ms both` }
});
