/* Rasmni telefonning o‘zida siqish: eng uzun tomoni ≤ 1080 px, JPEG, ≤ ~170 KB (Firestore hujjatiga sig‘sin). */
export const PHOTO_MAX = 5;
const MAX_SIDE = 1080;
const MAX_CHARS = 230_000; // data URL uzunligi (~170 KB)

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Rasmni ochib bo‘lmadi"));
    };
    img.src = url;
  });
}

export async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Faqat rasm fayli");
  const img = await loadImage(file);
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 6; attempt++) {
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas yo‘q");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.78, 0.68, 0.58]) {
      const data = canvas.toDataURL("image/jpeg", q);
      if (data.length <= MAX_CHARS) return data;
    }
    side = Math.round(side * 0.8);
  }
  throw new Error("Rasm juda katta");
}

/** Faqat telefonda siqilgan JPEG data URL’larini qabul qilamiz (boshqa manbadan kelgan matn ko‘rsatilmaydi) */
export const isPhotoData = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/jpeg;base64,") && v.length <= MAX_CHARS;
