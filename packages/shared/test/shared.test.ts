import {
  APP_LIMITS,
  EMPTY_FILTERS,
  PRICES,
  RISHTON,
  SUBJECTS,
  TG_LOGIN,
  TRIAL_DAYS,
  applicationLimitError,
  billingOf,
  canConfirm,
  canFinish,
  centerUrl,
  distanceKm,
  extendUntil,
  filterCenters,
  findMatches,
  fmtPriceFrom,
  fmtSum,
  formatDistance,
  groupWhen,
  isBlocked,
  isLoginToken,
  maskPhone,
  median,
  nextLessonMs,
  normalizePhone,
  parseQuery,
  parseStartLogin,
  priceLevel,
  subjectMedians,
  tariffPrice,
  tashkentDate,
  tgUid,
  watchTitle,
  type Center
} from "../src";

const DAY = 86400000;

function center(id: string, over: Partial<Center> = {}): Center {
  return {
    id,
    name: `Markaz ${id}`,
    address: "Rishton",
    lat: RISHTON.lat,
    lng: RISHTON.lng,
    phone: "+998900000000",
    amenities: [],
    vip: false,
    rating: null,
    reviewsCount: 0,
    description: "",
    ageFrom: null,
    ageTo: null,
    photoUrl: null,
    kind: "center",
    groups: [{ subject: "Ingliz tili", days: ["Du", "Ch"], time: "16:00–17:30", price: 250000, freeSeats: 3 }],
    teachers: [],
    updatedMs: 0,
    claimed: true,
    verified: false,
    verifiedMs: null,
    photoCount: 0,
    ...over
  };
}

describe("fanlar", () => {
  test("31 ta, «Boshqa» oxirida, IELTS/CEFR/SAT bor", () => {
    expect(SUBJECTS).toHaveLength(31);
    expect(SUBJECTS[SUBJECTS.length - 1]).toBe("Boshqa");
    expect(SUBJECTS).toEqual(expect.arrayContaining(["IELTS", "CEFR", "SAT"]));
    expect(new Set(SUBJECTS).size).toBe(SUBJECTS.length);
  });
});

describe("qidiruv parseri", () => {
  test("«ingliz tili 300 ming shanba»", () => {
    const p = parseQuery("ingliz tili 300 ming shanba");
    expect(p.subject).toBe("Ingliz tili");
    expect(p.maxPrice).toBe(300000);
    expect(p.days).toEqual(["Sh"]);
  });
  test("yakshanba shanba deb o‘qilmaydi; sefr -> CEFR; yaqin", () => {
    expect(parseQuery("yakshanba").days).toEqual(["Ya"]);
    expect(parseQuery("sefr kurslari").subject).toBe("CEFR");
    expect(parseQuery("uyga yaqin matematika").nearest).toBe(true);
    expect(parseQuery("250000 so'm").maxPrice).toBe(250000);
  });
  test("findMatches: narx chegarasi va bo‘sh joyi borlar oldin", () => {
    const cs = [
      center("a", { groups: [{ subject: "Ingliz tili", days: ["Sh"], time: "10:00", price: 350000, freeSeats: 2 }] }),
      center("b", { groups: [{ subject: "Ingliz tili", days: ["Sh"], time: "10:00", price: 280000, freeSeats: 0 }] }),
      center("c", { groups: [{ subject: "Ingliz tili", days: ["Sh"], time: "10:00", price: 290000, freeSeats: 4 }] })
    ];
    const m = findMatches(cs, parseQuery("ingliz tili 300 ming shanba"), RISHTON);
    expect(m.map((x) => x.center.id)).toEqual(["c", "b"]);
  });
});

describe("filtrlar", () => {
  test("fan, bo‘sh joy, VIP oldin", () => {
    const cs = [
      center("a"),
      center("v", { vip: true, lat: RISHTON.lat + 0.02 }),
      center("m", { groups: [{ subject: "Matematika", days: ["Du"], time: "10:00", price: 200000, freeSeats: 0 }] })
    ];
    expect(filterCenters(cs, { ...EMPTY_FILTERS, subject: "Ingliz tili" }, RISHTON).map((v) => v.center.id)).toEqual(["v", "a"]);
    expect(filterCenters(cs, { ...EMPTY_FILTERS, freeOnly: true }, RISHTON).map((v) => v.center.id)).toEqual(["v", "a"]);
    expect(filterCenters(cs, { ...EMPTY_FILTERS, radius: 1 }, RISHTON).map((v) => v.center.id)).toEqual(["a", "m"]);
  });
});

describe("masofa va formatlash", () => {
  test("masofa", () => {
    expect(distanceKm(RISHTON, RISHTON)).toBe(0);
    expect(formatDistance(0.26)).toBe("260 m");
    expect(formatDistance(1.24)).toBe("1,2 km");
  });
  test("so‘m, telefon, guruh vaqti", () => {
    expect(fmtSum(250000)).toBe("250 000 so‘m");
    expect(fmtPriceFrom(0)).toBe("Narxini so‘rang");
    expect(maskPhone("901234567")).toBe("+998 90 123 45 67");
    expect(normalizePhone("+998 90 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("12345")).toBeNull();
    expect(groupWhen({ days: [], time: "" })).toBe("Vaqtini qo‘ng‘iroq qilib aniqlang");
    expect(groupWhen({ days: ["Du", "Ch"], time: "16:00" })).toBe("Du, Ch · 16:00");
  });
  test("keyingi dars vaqti", () => {
    const mon = new Date(2026, 10, 16, 12, 0).getTime(); // dushanba
    const t = nextLessonMs(["Ch"], "16:00–17:30", mon)!;
    expect(new Date(t).getDay()).toBe(3);
    expect(new Date(t).getHours()).toBe(16);
  });
});

describe("tariflar va obuna", () => {
  test("narxlar va 15 kun", () => {
    expect(TRIAL_DAYS).toBe(15);
    expect(tariffPrice("tutor", "oddiy")).toBe(45000);
    expect(tariffPrice("center", null)).toBe(75000);
    expect(tariffPrice("tutor", "vip")).toBe(PRICES.vip);
  });
  test("billingOf holatlari", () => {
    const now = Date.UTC(2026, 10, 16);
    const base = { approved: true, vip: false, kind: "tutor" as const, tariff: "oddiy" as const, createdMs: now - 5 * DAY, paidUntilMs: null };
    expect(billingOf(base, now)).toMatchObject({ state: "trial", price: 45000, days: 10 });
    expect(billingOf({ ...base, createdMs: now - 20 * DAY }, now).state).toBe("overdue");
    expect(billingOf({ ...base, paidUntilMs: now + 40 * DAY }, now).state).toBe("active");
    expect(billingOf({ ...base, approved: false }, now).state).toBe("pending");
    const b = billingOf(base, now);
    expect(extendUntil(b, 1, now)).toBe(b.until + 30 * DAY);
  });
});

describe("o‘rtacha narx va kuzatuv", () => {
  test("mediana kamida 3 guruhda", () => {
    expect(median([1, 3, 2])).toBe(2);
    const cs = [center("a"), center("b", { groups: [{ subject: "Ingliz tili", days: [], time: "", price: 300000, freeSeats: 0 }] })];
    expect(subjectMedians(cs).get("Ingliz tili")).toBeUndefined();
    cs.push(center("c", { groups: [{ subject: "Ingliz tili", days: [], time: "", price: 280000, freeSeats: 0 }] }));
    expect(subjectMedians(cs).get("Ingliz tili")?.median).toBe(280000);
    expect(priceLevel(200000, 280000)).toBe("cheap");
    expect(priceLevel(400000, 280000)).toBe("pricey");
  });
  test("kuzatuv sarlavhasi", () => {
    expect(watchTitle({ subject: "IT", radiusKm: 0.5, maxPrice: 300000, days: ["Du"] })).toBe("IT · 500 m gacha · 300 ming so‘mgacha · Du");
  });
});

describe("ariza limitlari", () => {
  test("uid, markaz, telefon", () => {
    expect(applicationLimitError({ uidToday: 0, uidCenterToday: 0, phoneToday: 0 })).toBeNull();
    expect(applicationLimitError({ uidToday: 1, uidCenterToday: APP_LIMITS.perCenterPerDay, phoneToday: 1 })).toMatch(/markazga/);
    expect(applicationLimitError({ uidToday: APP_LIMITS.perUidPerDay, uidCenterToday: 0, phoneToday: 0 })).toMatch(/juda ko‘p/);
    expect(applicationLimitError({ uidToday: 0, uidCenterToday: 0, phoneToday: APP_LIMITS.perPhonePerDay })).toMatch(/telefon/);
  });
});

describe("Telegram orqali kirish", () => {
  const tok = "A".repeat(16) + "b".repeat(15) + "9";
  const now = 1_000_000;
  test("token va /start", () => {
    expect(isLoginToken(tok)).toBe(true);
    expect(isLoginToken("qisqa")).toBe(false);
    expect(parseStartLogin(`/start login_${tok}`)).toBe(tok);
    expect(parseStartLogin(`/start@yaqindars_bot login_${tok}`)).toBe(tok);
    expect(parseStartLogin("/start c_abc")).toBeNull();
    expect(parseStartLogin(`/start login_${tok}x`)).toBeNull();
  });
  test("tasdiqlash: muddat va bir martalik", () => {
    const doc = { anonUid: "u1", status: "pending" as const, expiresAt: now + TG_LOGIN.ttlMs };
    expect(canConfirm(doc, now)).toBeNull();
    expect(canConfirm({ ...doc, status: "confirmed" }, now)).toMatch(/ishlatilgan/);
    expect(canConfirm(doc, now + TG_LOGIN.ttlMs + 1)).toMatch(/muddati/);
    expect(canConfirm(null, now)).toMatch(/topilmadi/);
  });
  test("yakunlash: faqat o‘sha qurilma, tasdiqlangan", () => {
    const ok = { anonUid: "u1", status: "confirmed" as const, expiresAt: now + 1000, tgId: 42 };
    expect(canFinish(ok, "u1", now)).toBeNull();
    expect(canFinish(ok, "u2", now)).toMatch(/boshqa qurilma/);
    expect(canFinish({ ...ok, status: "pending" }, "u1", now)).toMatch(/tasdiqlanmagan/);
    expect(canFinish({ ...ok, status: "used" }, "u1", now)).toMatch(/yakunlangan/);
    expect(tgUid(42)).toBe("tg_42");
  });
  test("5 xatodan keyin 15 daqiqa blok", () => {
    expect(isBlocked({ count: 5, lastMs: now }, now + 60_000)).toBe(true);
    expect(isBlocked({ count: 5, lastMs: now }, now + TG_LOGIN.blockMs + 1)).toBe(false);
    expect(isBlocked({ count: 4, lastMs: now }, now)).toBe(false);
  });
});

describe("havolalar va sana", () => {
  test("markaz havolasi va Toshkent sanasi", () => {
    expect(centerUrl("abc")).toBe("https://yaqindars.uz/c/abc");
    expect(tashkentDate(Date.UTC(2026, 10, 15, 22, 30))).toBe("2026-11-16");
  });
});
