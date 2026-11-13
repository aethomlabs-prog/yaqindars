// DEMO uchun namuna ma’lumotlar (haqiqiy markazlar emas). Rishton markazi atrofida.
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

export const DEMO_CENTERS = [
  {
    id: "demo1", name: "Namuna: Bilimdon markazi", address: "Rishton, Mustaqillik ko‘chasi (namuna)",
    lat: 40.3592, lng: 71.2861, phone: "+998900000001", vip: true, rating: 4.8,
    amenities: ["Wi-Fi", "Konditsioner", "Kompyuter xonasi"], updatedAt: now - 1 * DAY,
    groups: [
      { subject: "Ingliz tili", days: ["Du", "Ch", "Ju"], time: "16:00–17:30", price: 300000, freeSeats: 3 },
      { subject: "Matematika", days: ["Se", "Pa", "Sh"], time: "15:00–16:30", price: 250000, freeSeats: 0 }
    ]
  },
  {
    id: "demo2", name: "Namuna: IT Akademiya", address: "Rishton, Navoiy ko‘chasi (namuna)",
    lat: 40.3541, lng: 71.2795, phone: "+998900000002", vip: false, rating: 4.6,
    amenities: ["Wi-Fi", "Kompyuter xonasi"], updatedAt: now - 3 * DAY,
    groups: [
      { subject: "IT", days: ["Du", "Ch", "Ju"], time: "14:00–16:00", price: 400000, freeSeats: 5 },
      { subject: "IT", days: ["Se", "Pa"], time: "17:00–19:00", price: 350000, freeSeats: 1 }
    ]
  },
  {
    id: "demo3", name: "Namuna: Kimyo-Biologiya", address: "Rishton, Bog‘ ko‘chasi (namuna)",
    lat: 40.3615, lng: 71.2932, phone: "+998900000003", vip: false, rating: 4.5,
    amenities: ["Konditsioner"], updatedAt: now - 20 * DAY,
    groups: [
      { subject: "Kimyo", days: ["Se", "Pa", "Sh"], time: "09:00–10:30", price: 220000, freeSeats: 2 },
      { subject: "Biologiya", days: ["Du", "Ch"], time: "11:00–12:30", price: 220000, freeSeats: 4 }
    ]
  },
  {
    id: "demo4", name: "Namuna: Rus tili kursi", address: "Rishton, Tinchlik ko‘chasi (namuna)",
    lat: 40.3518, lng: 71.2899, phone: "+998900000004", vip: false, rating: 4.3,
    amenities: ["Wi-Fi"], updatedAt: now - 2 * DAY,
    groups: [
      { subject: "Rus tili", days: ["Du", "Ch", "Ju"], time: "15:00–16:00", price: 180000, freeSeats: 0 }
    ]
  },
  {
    id: "demo5", name: "Namuna: Sport to‘garagi", address: "Rishton, stadion yonida (namuna)",
    lat: 40.3640, lng: 71.2810, phone: "+998900000005", vip: false, rating: 4.7,
    amenities: ["Kiyinish xonasi"], updatedAt: now - 5 * DAY,
    groups: [
      { subject: "Sport", days: ["Se", "Pa", "Sh"], time: "17:00–18:30", price: 150000, freeSeats: 8 }
    ]
  },
  {
    id: "demo6", name: "Namuna: Matematika repetitor", address: "Rishton, Yoshlik mahallasi (namuna)",
    lat: 40.3570, lng: 71.2760, phone: "+998900000006", vip: true, rating: 4.9,
    amenities: ["Kichik guruh (6 kishi)"], updatedAt: now - 1 * DAY,
    groups: [
      { subject: "Matematika", days: ["Du", "Ch", "Ju"], time: "18:00–19:30", price: 350000, freeSeats: 2 },
      { subject: "Fizika", days: ["Se", "Pa"], time: "18:00–19:30", price: 300000, freeSeats: 1 }
    ]
  }
];
