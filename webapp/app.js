import { FIREBASE_CONFIG } from "./config.js";
import { DEMO_CENTERS } from "./demo.js";

/* ---------- Telegram ---------- */
// Oddiy brauzerda ham SDK yuklanadi, lekin initData bo'sh bo'ladi — u holda Telegram funksiyalarini chaqirmaymiz.
const tg = window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
const tgCan = (ver) => !!tg && (tg.isVersionAtLeast?.(ver) ?? false);
if (tg) {
  tg.ready();
  tg.expand();
  if (tgCan("6.1")) {
    tg.setHeaderColor("#1E6FD9");
    tg.setBackgroundColor("#F4F6FA");
  }
}
const backBtn = tgCan("6.1") ? tg.BackButton : null;
const tgUser = tg?.initDataUnsafe?.user || null;

/* ---------- Constants ---------- */
const SUBJECTS = ["Ingliz tili", "Matematika", "IT", "Rus tili", "Kimyo", "Biologiya", "Fizika", "Ona tili", "Sport", "Boshqa"];
const DAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];
const DEFAULT_POS = { lat: 40.3567, lng: 71.2847 }; // Rishton
const STALE_DAYS = 14;
const PIN = "M50 4 C26 4 8 22 8 46 C8 76 50 116 50 116 C50 116 92 76 92 46 C92 22 74 4 50 4 Z";
const FB_VER = "10.12.2";

/* Inline SVG ikonkalar (interfeysda emoji ishlatilmaydi) */
const ICON = {
  star: '<svg class="ic" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5-4.9-4.6 6.6-.8z"/></svg>',
  pin: '<svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  phone: '<svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>',
  route: '<svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z"/></svg>'
};

const state = {
  centers: [],
  userPos: null,
  subject: null,
  maxPrice: 0,
  days: [],
  freeOnly: false,
  demo: false,
  applyFor: null // { centerId, groupIndex }
};
let fb = null; // { db, fs }
let map, markerLayer, meMarker;

/* ---------- Helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtSum = (n) => Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " so‘m";
const toMs = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : Number(t) || 0);
const pos = () => state.userPos || DEFAULT_POS;

function distKm(a, b) {
  const R = 6371, r = (x) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const fmtDist = (km) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1).replace(".", ",")} km`);

function daysAgo(ms) {
  if (!ms) return null;
  return Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
}

let toastTimer;
function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}
const haptic = (type) => tgCan("6.1") && tg.HapticFeedback.notificationOccurred(type);

/* ---------- Data ---------- */
async function initFirebase() {
  if (!FIREBASE_CONFIG) return null;
  const [appMod, fs] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore.js`)
  ]);
  const app = appMod.initializeApp(FIREBASE_CONFIG);
  return { db: fs.getFirestore(app), fs };
}

async function loadCenters() {
  const { db, fs } = fb;
  const q = fs.query(fs.collection(db, "centers"), fs.where("approved", "==", true));
  const snap = await fs.getDocs(q);
  return snap.docs.map((d) => normalize({ id: d.id, ...d.data() }));
}

function normalize(c) {
  return {
    ...c,
    lat: Number(c.lat),
    lng: Number(c.lng),
    amenities: Array.isArray(c.amenities) ? c.amenities : [],
    groups: (Array.isArray(c.groups) ? c.groups : []).map((g) => ({
      subject: g.subject || "Boshqa",
      days: Array.isArray(g.days) ? g.days : [],
      time: g.time || "",
      price: Number(g.price) || 0,
      freeSeats: Number(g.freeSeats) || 0
    })),
    updatedMs: toMs(c.updatedAt)
  };
}

/* ---------- Filtering ---------- */
function groupMatches(g) {
  if (state.subject && g.subject !== state.subject) return false;
  if (state.maxPrice && g.price > state.maxPrice) return false;
  if (state.days.length && !g.days.every((d) => state.days.includes(d))) return false;
  if (state.freeOnly && g.freeSeats <= 0) return false;
  return true;
}

function visibleCenters() {
  const p = pos();
  return state.centers
    .map((c) => ({ c, groups: c.groups.filter(groupMatches), km: distKm(p, c) }))
    .filter((x) => x.groups.length > 0 && Number.isFinite(x.km))
    .sort((a, b) => Number(!!b.c.vip) - Number(!!a.c.vip) || a.km - b.km);
}

/* ---------- Map ---------- */
function initMap() {
  map = L.map("map", { zoomControl: false, attributionControl: true }).setView([DEFAULT_POS.lat, DEFAULT_POS.lng], 14);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  tg?.onEvent?.("viewportChanged", () => map.invalidateSize());
  window.addEventListener("resize", () => map.invalidateSize());
}

function pinIcon(fill, big) {
  const w = big ? 38 : 30, h = big ? 46 : 36;
  return L.divIcon({
    className: "pin",
    html: `<svg width="${w}" height="${h}" viewBox="0 0 100 120"><path d="${PIN}" fill="${fill}" stroke="#FFFFFF" stroke-width="6"/><circle cx="50" cy="46" r="20" fill="#FFFFFF"/></svg>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h]
  });
}

function drawMarkers(list) {
  markerLayer.clearLayers();
  for (const { c, groups } of list) {
    const free = groups.reduce((s, g) => s + g.freeSeats, 0);
    const color = free <= 0 ? "#9AA5B8" : c.vip ? "#F5B700" : "#1E6FD9";
    L.marker([c.lat, c.lng], { icon: pinIcon(color, !!c.vip), title: c.name, zIndexOffset: c.vip ? 500 : 0 })
      .on("click", () => openDetail(c.id))
      .addTo(markerLayer);
  }
}

function setMe(p) {
  const icon = L.divIcon({ className: "", html: '<div class="me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  if (meMarker) meMarker.setLatLng([p.lat, p.lng]);
  else meMarker = L.marker([p.lat, p.lng], { icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
}

function locate(explicit) {
  if (!navigator.geolocation) {
    if (explicit) toast("Qurilmangiz joylashuvni aniqlay olmaydi.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (r) => {
      state.userPos = { lat: r.coords.latitude, lng: r.coords.longitude };
      setMe(state.userPos);
      map.setView([state.userPos.lat, state.userPos.lng], 15);
      render();
    },
    () => {
      if (explicit) toast("Joylashuvni aniqlab bo‘lmadi. Telefon sozlamalarida ruxsat bering.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

/* ---------- Render ---------- */
function seatChip(n) {
  return n > 0 ? `<span class="chip ok">● ${n} ta bo‘sh joy</span>` : `<span class="chip no">Joy qolmadi</span>`;
}

function render() {
  const list = visibleCenters();
  drawMarkers(list);

  $("#countText").textContent = list.length ? `${list.length} ta markaz topildi` : "Markaz topilmadi";

  if (!list.length) {
    $("#cards").innerHTML = `<p class="empty">Bu filtr bo‘yicha markaz yo‘q. Filtrni o‘zgartirib ko‘ring.</p>`;
  } else {
    $("#cards").innerHTML = list
      .map(({ c, groups, km }) => {
        const free = groups.reduce((s, g) => s + g.freeSeats, 0);
        const minPrice = Math.min(...groups.map((g) => g.price));
        const subjects = [...new Set(groups.map((g) => g.subject))].join(", ");
        return `<button class="card${c.vip ? " vip" : ""}" data-id="${esc(c.id)}">
          <div class="card-top"><span class="name">${esc(c.name)}</span>${c.vip ? `<span class="badge vip">${ICON.star} VIP</span>` : ""}</div>
          <div class="meta">${fmtDist(km)} · ${esc(subjects)}</div>
          <div class="card-bottom"><span class="price">${fmtSum(minPrice)} dan</span>${seatChip(free)}</div>
        </button>`;
      })
      .join("");
  }

  const n = (state.maxPrice ? 1 : 0) + (state.days.length ? 1 : 0);
  const fc = $("#filterCount");
  fc.hidden = n === 0;
  fc.textContent = String(n);
}

/* ---------- Sheets & back button ---------- */
const openStack = [];
function openSheet(id) {
  const el = document.getElementById(id);
  el.hidden = false;
  if (!openStack.includes(id)) openStack.push(id);
  backBtn?.show();
}
function closeSheet(id) {
  document.getElementById(id).hidden = true;
  const i = openStack.indexOf(id);
  if (i >= 0) openStack.splice(i, 1);
  if (!openStack.length) backBtn?.hide();
}
function closeTop() {
  const id = openStack[openStack.length - 1];
  if (id) closeSheet(id);
}
backBtn?.onClick(closeTop);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeTop());

/* ---------- Detail ---------- */
function openDetail(id) {
  const c = state.centers.find((x) => x.id === id);
  if (!c) return;
  const km = distKm(pos(), c);
  const ago = daysAgo(c.updatedMs);
  const stale = ago !== null && ago > STALE_DAYS;
  const groups = c.groups
    .map((g, i) => ({ g, i }))
    .sort((a, b) => Number(groupMatches(b.g)) - Number(groupMatches(a.g)));

  $("#detailBody").innerHTML = `
    <div class="handle"></div>
    <div class="d-head">
      <div>
        <h2 class="d-name">${esc(c.name)}</h2>
        ${c.vip ? `<span class="badge vip">${ICON.star} VIP markaz</span>` : ""}
      </div>
      <button class="close" data-close aria-label="Yopish">${ICON.close}</button>
    </div>
    <div class="d-meta">
      <span class="d-addr">${ICON.pin} ${esc(c.address || "")} · ${fmtDist(km)}</span>
      ${c.rating ? `<span class="d-rate">${ICON.star} ${esc(String(c.rating).replace(".", ","))}</span>` : ""}
      ${ago !== null ? `<span>Yangilangan: ${ago === 0 ? "bugun" : ago + " kun oldin"}</span>` : ""}
    </div>
    ${stale ? '<div class="stale">Ma’lumot eskirgan bo‘lishi mumkin — yozilishdan oldin qo‘ng‘iroq qiling</div>' : ""}
    ${c.amenities.length ? `<div class="amen">${c.amenities.map((a) => `<span>${esc(a)}</span>`).join("")}</div>` : ""}
    <div class="row-btns">
      ${c.phone ? `<a class="btn ghost" href="tel:${esc(c.phone)}">${ICON.phone} Qo‘ng‘iroq</a>` : ""}
      <button class="btn ghost" data-route="${esc(c.id)}">${ICON.route} Yo‘l ko‘rsatish</button>
    </div>
    <p class="sec-title">Guruhlar</p>
    ${groups
      .map(
        ({ g, i }) => `<div class="group">
        <div class="g-top"><span class="g-subj">${esc(g.subject)}</span>${seatChip(g.freeSeats)}</div>
        <div class="g-info">${esc(g.days.join(", "))} · ${esc(g.time)} · <b>${fmtSum(g.price)}</b> / oy</div>
        <button class="g-btn" data-apply="${esc(c.id)}" data-g="${i}" ${g.freeSeats > 0 ? "" : "disabled"}>
          ${g.freeSeats > 0 ? "Bepul sinov darsiga yozilish" : "Joy qolmagan"}
        </button>
      </div>`
      )
      .join("")}
  `;
  openSheet("detail");
  $("#detailBody").scrollTop = 0;
  map.panTo([c.lat, c.lng], { animate: true });
}

function openRoute(id) {
  const c = state.centers.find((x) => x.id === id);
  if (!c) return;
  const from = state.userPos ? `${state.userPos.lat},${state.userPos.lng}` : "";
  const url = `https://yandex.uz/maps/?rtext=${from}~${c.lat},${c.lng}&rtt=auto`;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank");
}

/* ---------- Apply ---------- */
function openApply(centerId, groupIndex) {
  const c = state.centers.find((x) => x.id === centerId);
  const g = c?.groups[groupIndex];
  if (!g) return;
  state.applyFor = { centerId, groupIndex };
  $("#applyGroup").textContent = `${c.name} · ${g.subject} · ${g.days.join(", ")} · ${g.time}`;
  $("#formErr").hidden = true;
  if (!$("#fName").value && tgUser?.first_name) $("#fName").value = tgUser.first_name;
  openSheet("applySheet");
}

function showFormErr(text) {
  const e = $("#formErr");
  e.textContent = text;
  e.hidden = false;
}

async function submitApply(ev) {
  ev.preventDefault();
  const name = $("#fName").value.trim();
  let digits = $("#fPhone").value.replace(/\D/g, "");
  if (digits.length === 9) digits = "998" + digits; // 90 123 45 67
  const phone = "+" + digits;
  if (name.length < 2) return showFormErr("O‘quvchi ismini yozing (kamida 2 harf).");
  if (!/^\+998\d{9}$/.test(phone)) return showFormErr("Telefon raqamni +998 XX XXX XX XX ko‘rinishida yozing.");

  const { centerId, groupIndex } = state.applyFor || {};
  const c = state.centers.find((x) => x.id === centerId);
  const g = c?.groups[groupIndex];
  if (!g) return showFormErr("Guruh topilmadi. Qaytadan urinib ko‘ring.");

  const btn = $("#applySubmit");
  btn.disabled = true;
  try {
    if (fb) {
      const { db, fs } = fb;
      await fs.addDoc(fs.collection(db, "applications"), {
        centerId: c.id,
        centerName: String(c.name).slice(0, 100),
        group: `${g.subject} · ${g.days.join(", ")} · ${g.time}`.slice(0, 120),
        name: name.slice(0, 60),
        phone,
        tgUserId: tgUser?.id ?? null,
        tgUsername: tgUser?.username ?? null,
        createdAt: fs.serverTimestamp(),
        notified: false,
        status: "new"
      });
    }
    closeSheet("applySheet");
    closeSheet("detail");
    haptic("success");
    toast(state.demo ? "DEMO: ariza qabul qilindi (haqiqiy markazga bormaydi)." : "Ariza yuborildi! Markaz siz bilan tez orada bog‘lanadi.");
  } catch (e) {
    console.error(e);
    haptic("error");
    showFormErr("Yuborib bo‘lmadi. Internetni tekshirib, qayta urinib ko‘ring.");
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Controls ---------- */
function buildSubjectChips() {
  const all = [null, ...SUBJECTS];
  $("#subjects").innerHTML = all
    .map((s) => `<button class="chip-btn" data-subj="${esc(s ?? "")}" aria-pressed="${state.subject === s}">${esc(s ?? "Hammasi")}</button>`)
    .join("");
}
function buildDayChips() {
  $("#dayChips").innerHTML = DAYS.map(
    (d) => `<button type="button" class="chip-btn" data-day="${d}" aria-pressed="${state.days.includes(d)}">${d}</button>`
  ).join("");
}

function bind() {
  $("#subjects").addEventListener("click", (e) => {
    const b = e.target.closest("[data-subj]");
    if (!b) return;
    state.subject = b.dataset.subj || null;
    buildSubjectChips();
    render();
  });
  $("#dayChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-day]");
    if (!b) return;
    const d = b.dataset.day;
    state.days = state.days.includes(d) ? state.days.filter((x) => x !== d) : [...state.days, d];
    buildDayChips();
    render();
  });
  $("#maxPrice").addEventListener("change", (e) => {
    state.maxPrice = Number(e.target.value) || 0;
    render();
  });
  $("#resetFilters").addEventListener("click", () => {
    state.maxPrice = 0;
    state.days = [];
    $("#maxPrice").value = "0";
    buildDayChips();
    render();
  });
  $("#freeOnly").addEventListener("change", (e) => {
    state.freeOnly = e.target.checked;
    render();
  });
  $("#filterBtn").addEventListener("click", () => openSheet("filterSheet"));
  $("#locBtn").addEventListener("click", () => locate(true));
  $("#cards").addEventListener("click", (e) => {
    const b = e.target.closest("[data-id]");
    if (b) openDetail(b.dataset.id);
  });
  $("#detailBody").addEventListener("click", (e) => {
    const a = e.target.closest("[data-apply]");
    if (a) return openApply(a.dataset.apply, Number(a.dataset.g));
    const r = e.target.closest("[data-route]");
    if (r) return openRoute(r.dataset.route);
  });
  $("#applyForm").addEventListener("submit", submitApply);

  document.querySelectorAll(".overlay").forEach((ov) => {
    ov.addEventListener("click", (e) => {
      if (e.target === ov || e.target.closest("[data-close]")) closeSheet(ov.id);
    });
  });
}

/* ---------- Start ---------- */
async function main() {
  buildSubjectChips();
  buildDayChips();
  bind();
  initMap();

  if (!FIREBASE_CONFIG) {
    state.demo = true;
    $("#demoBanner").hidden = false;
    state.centers = DEMO_CENTERS.map(normalize);
  } else {
    try {
      fb = await initFirebase();
      state.centers = await loadCenters();
    } catch (e) {
      console.error(e);
      toast("Ma’lumotlarni yuklab bo‘lmadi. Internetni tekshiring.");
    }
  }
  render();
  locate(false);
}

main();
