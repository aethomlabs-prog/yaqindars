/* YaqinDars service worker — tez ochilish va internetsiz ishlash.
 *  - /assets/* (nomida xesh bor, o‘zgarmaydi): keshdan darhol (cache-first)
 *  - sahifa (HTML): tarmoqdan, 3 s ichida javob bo‘lmasa yoki internet yo‘q — keshdagi nusxa
 *  - Telegram SDK, ikonkalar, manifest: keshdan darhol, fonda yangilanadi
 *  - Firebase, xarita plitkalari va boshqa tashqi so‘rovlar — tegilmaydi */
const VERSION = "yd-v3";
const SHELL = ["./", "./index.html", "./telegram-web-app.js", "./manifest.webmanifest", "./favicon.svg", "./icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .catch(() => {}) // bitta fayl yuklanmasa ham o‘rnatilaversin
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const put = (req, res) => {
  if (res && res.ok && res.type === "basic") {
    const copy = res.clone();
    caches.open(VERSION).then((c) => c.put(req, copy));
  }
  return res;
};

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase, plitkalar, shriftlar — brauzerning o‘zi

  // Sahifa: tarmoq birinchi (yangilanishlar darhol), sekin/yo‘q bo‘lsa — kesh
  if (req.mode === "navigate") {
    const isShell = url.pathname.endsWith("/") || url.pathname.endsWith("/index.html");
    const net = fetch(req).then((res) => (isShell ? put(new Request("./index.html"), res) : res));
    e.respondWith(
      withTimeout(net, 3000).catch(() => caches.match(isShell ? "./index.html" : req).then((r) => r || net))
    );
    return;
  }

  // Xeshli fayllar: keshdan darhol
  if (url.pathname.includes("/assets/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }

  // Qolganlari (SDK, ikonkalar, manifest): keshdan darhol + fonda yangilash
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => put(req, res))
        .catch(() => hit);
      return hit || net;
    })
  );
});
