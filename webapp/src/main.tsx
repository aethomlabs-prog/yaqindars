import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { installErrorLog } from "./lib/errorLog";
import { initTelegram } from "./lib/telegram";
import { useNav } from "./store/nav";
import "./index.css";

// Xatolarni eng boshidan ushlaymiz (qaysi ekranda bo‘lgani bilan)
installErrorLog(() => {
  const mode = new URLSearchParams(location.search).get("mode");
  if (mode) return mode;
  const { tab, stacks } = useNav.getState();
  const top = stacks[tab][stacks[tab].length - 1];
  return top ? `${tab}/${top.route.name}` : tab;
});

initTelegram();

// Service worker: tez ochilish (keshdan), internetsiz ishlash va brauzerda o‘rnatish (PWA).
// Telegram ichida ham — u yerda ham keyingi ochilishlar keshdan bir zumda bo‘ladi.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
