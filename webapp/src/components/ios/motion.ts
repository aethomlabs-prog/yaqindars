import type { Transition } from "framer-motion";

export const spring: Transition = { type: "spring", stiffness: 400, damping: 32 };
export const pushTransition: Transition = { type: "tween", duration: 0.35, ease: [0.32, 0.72, 0, 1] };

/** Ro‘yxat elementlari 30 ms kechikish bilan ketma-ket chiqadi */
export const listItem = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { ...spring, delay: Math.min(i, 12) * 0.03 }
});

export const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** animate(motionValue, n, …) uchun — umumiy Transition turi overload’ga mos kelmaydi */
export const springValue = { type: "spring" as const, stiffness: 400, damping: 32 };
