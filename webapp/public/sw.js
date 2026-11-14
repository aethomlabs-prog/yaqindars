/* YaqinDars service worker: ilovani o‘rnatish (PWA) uchun. Sahifalar har doim tarmoqdan olinadi,
   internet bo‘lmasa — oxirgi saqlangan nusxa ko‘rsatiladi. */
const CACHE = "yd-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./")))
  );
});
