/* Store’dagi showToast/notify → motion/Island. Ilovada bitta (IslandProvider ichida). */
import { useEffect } from "react";
import { useIsland } from "./motion";
import { useApp } from "../store/app";

const TONE = { ok: "success", error: "error", info: "info" } as const;

export function IslandBridge() {
  const toast = useApp((s) => s.toast);
  const island = useIsland();
  useEffect(() => {
    if (toast) island({ title: toast.text, text: toast.sub, tone: TONE[toast.kind], onTap: toast.onTap });
  }, [toast, island]);
  return null;
}
