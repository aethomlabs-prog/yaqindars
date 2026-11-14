/* «Dynamic Island» uslubidagi toast: yuqoridan tushadigan qora pill. */
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { useApp } from "../../store/app";
import { spring } from "./motion";

export function Toast() {
  const toast = useApp((s) => s.toast);
  const Icon = toast?.kind === "ok" ? CheckCircle2 : toast?.kind === "error" ? AlertCircle : Info;
  const color = toast?.kind === "ok" ? "#30D158" : toast?.kind === "error" ? "#FF6B4A" : "#64A8FF";
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center" style={{ paddingTop: "calc(8px + var(--safe-top))" }} role="status" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: -60, scaleX: 0.5, opacity: 0 }}
            animate={{ y: 0, scaleX: 1, opacity: 1 }}
            exit={{ y: -60, scaleX: 0.6, opacity: 0 }}
            transition={spring}
            className="mx-4 flex max-w-[400px] items-center gap-2.5 rounded-[22px] bg-black px-4 py-3 text-[15px] font-medium text-white shadow-float"
          >
            <Icon size={20} color={color} className="shrink-0" aria-hidden />
            <span>{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
