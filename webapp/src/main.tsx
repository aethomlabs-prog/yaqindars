import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { inTelegram, initTelegram } from "./lib/telegram";
import "./index.css";

initTelegram();

// Brauzerda (Telegram tashqarisida) ilovani o‘rnatish mumkin bo‘lsin — PWA service worker
if (!inTelegram && "serviceWorker" in navigator && import.meta.env.PROD) {
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
