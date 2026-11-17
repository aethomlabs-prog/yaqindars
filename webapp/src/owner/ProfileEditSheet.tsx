/* Kabinet → «Profilni tahrirlash»: nomi, telefon, manzil, tavsif, sharoitlar, yosh, xaritadagi joy va 1–5 ta rasm. */
import { ArrowLeft, ImagePlus, Star, Trash2 } from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Button, Chip } from "../components/ios/controls";
import { Sheet } from "../components/ios/Sheet";
import type { OwnerCenter } from "../lib/backend";
import { normalizePhone } from "../lib/format";
import { compressImage, PHOTO_MAX } from "../lib/image";
import { haptic } from "../lib/telegram";
import { useApp } from "../store/app";

const MapPicker = lazy(() => import("../screens/map/MapPicker"));
const AMENITIES = ["Wi-Fi", "Konditsioner", "Kompyuter xonasi", "Kutubxona", "Kuzatuv kamerasi", "Kutish zali", "Avtoturargoh", "Onlayn dars", "Uyda dars"];
const field = "h-11 w-full rounded-[12px] bg-card2 px-3 text-body outline-none focus:ring-2 focus:ring-tint/40";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-footnote font-semibold text-ink2">{children}</span>;
}

export function ProfileEditSheet({ center, open, onClose }: { center: OwnerCenter; open: boolean; onClose: () => void }) {
  const backend = useApp((s) => s.backend);
  const owner = backend?.owner;
  const showToast = useApp((s) => s.showToast);
  const tutor = center.kind === "tutor";
  const [name, setName] = useState(center.name);
  const [phone, setPhone] = useState(center.phone);
  const [address, setAddress] = useState(center.address);
  const [description, setDescription] = useState(center.description);
  const [amenities, setAmenities] = useState<string[]>(center.amenities);
  const [ageFrom, setAgeFrom] = useState(center.ageFrom != null ? String(center.ageFrom) : "");
  const [ageTo, setAgeTo] = useState(center.ageTo != null ? String(center.ageTo) : "");
  const [pos, setPos] = useState({ lat: center.lat, lng: center.lng });
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [photosDirty, setPhotosDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Oyna ochilganda joriy rasmlarni yuklaymiz
  useEffect(() => {
    if (!open || !backend) return;
    let alive = true;
    backend
      .loadPhotos(center.id)
      .then((p) => alive && (setPhotos(p), setPhotosDirty(false)))
      .catch(() => alive && setPhotos([]));
    return () => {
      alive = false;
    };
  }, [open, backend, center.id]);

  const phoneOk = normalizePhone(phone);
  const aFrom = ageFrom ? Number(ageFrom) : null;
  const aTo = ageTo ? Number(ageTo) : null;
  const ageOk = (aFrom == null && aTo == null) || (aFrom != null && aTo != null && aFrom >= 2 && aTo <= 80 && aFrom <= aTo);
  const valid = name.trim().length >= 2 && !!phoneOk && address.trim().length >= 3 && ageOk;

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !photos) return;
    const room = PHOTO_MAX - photos.length;
    if (room <= 0) return showToast(`Ko‘pi bilan ${PHOTO_MAX} ta rasm`, "info");
    setAdding(true);
    try {
      const out: string[] = [];
      for (const f of Array.from(files).slice(0, room)) out.push(await compressImage(f));
      setPhotos([...photos, ...out]);
      setPhotosDirty(true);
      if (files.length > room) showToast(`Faqat ${room} tasi qo‘shildi — ko‘pi bilan ${PHOTO_MAX} ta`, "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Rasmni qo‘shib bo‘lmadi", "error");
    } finally {
      setAdding(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const move = (k: number, to: number) => {
    if (!photos) return;
    const next = [...photos];
    const [x] = next.splice(k, 1);
    next.splice(to, 0, x);
    setPhotos(next);
    setPhotosDirty(true);
  };

  const save = async () => {
    if (!owner || !valid) return;
    setBusy(true);
    try {
      await owner.saveProfile(center.id, {
        name: name.trim(),
        phone: phoneOk!,
        address: address.trim(),
        description: description.trim(),
        amenities,
        ageFrom: aFrom,
        ageTo: aTo,
        lat: pos.lat,
        lng: pos.lng
      });
      if (photosDirty && photos) await owner.savePhotos(center.id, photos);
      haptic.success();
      showToast("Profil saqlandi — ilovada darhol ko‘rinadi", "ok");
      onClose();
    } catch (e) {
      console.error(e);
      showToast("Saqlanmadi. Internetni tekshiring.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title="Profilni tahrirlash"
      footer={
        <Button className="w-full" disabled={!valid || adding} loading={busy} onClick={save}>
          Saqlash
        </Button>
      }
    >
      <div className="space-y-5 px-4 pb-4">
        {/* Rasmlar */}
        <div>
          <Label>Rasmlar (ixtiyoriy, {PHOTO_MAX} tagacha) — birinchisi muqova</Label>
          {photos === null ? (
            <div className="h-24 animate-pulse rounded-[14px] bg-card2" />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, k) => (
                <div key={k} className="relative aspect-square overflow-hidden rounded-[14px] bg-card2">
                  <img src={p} alt={`${k + 1}-rasm`} className="h-full w-full object-cover" />
                  {k === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-px text-caption font-semibold text-white">Muqova</span>}
                  <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between">
                    {k > 0 ? (
                      <button aria-label="Muqova qilish" onClick={() => move(k, 0)} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
                        <Star size={15} />
                      </button>
                    ) : (
                      <span />
                    )}
                    <div className="flex gap-1">
                      {k > 0 && (
                        <button aria-label="Chapga surish" onClick={() => move(k, k - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white">
                          <ArrowLeft size={15} />
                        </button>
                      )}
                      <button
                        aria-label="Rasmni o‘chirish"
                        onClick={() => (setPhotos(photos.filter((_, j) => j !== k)), setPhotosDirty(true))}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {photos.length < PHOTO_MAX && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={adding}
                  className="focus-ring flex aspect-square flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed border-[var(--sep)] text-footnote text-tint"
                >
                  {adding ? <span className="app-busy" aria-label="Yuklanmoqda"><i /><i /><i /></span> : <ImagePlus size={24} aria-hidden />}
                  Rasm qo‘shish
                </button>
              )}
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} aria-label="Rasm tanlash" />
        </div>

        <label className="block">
          <Label>{tutor ? "Ism va familiya" : "Markaz nomi"}</Label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </label>
        <label className="block">
          <Label>Telefon</Label>
          <input className={`${field} tnum`} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
          {phone && !phoneOk && <span className="mt-1 block text-caption text-red-text">Raqam noto‘g‘ri</span>}
        </label>
        <label className="block">
          <Label>Manzil (mo‘ljal bilan)</Label>
          <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="Rishton, Mustaqillik ko‘chasi 12, bozor yonida" />
        </label>
        <div>
          <Label>Xaritadagi joyi — xaritani suring, pin {tutor ? "dars o‘tadigan joy" : "bino"} ustida tursin</Label>
          <div className="h-[220px]">
            {open && (
              <Suspense fallback={<div className="h-full rounded-card bg-card2" />}>
                <MapPicker initial={{ lat: center.lat, lng: center.lng }} onChange={setPos} />
              </Suspense>
            )}
          </div>
        </div>
        <label className="block">
          <Label>Tavsif</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder={tutor ? "Tajribangiz, sertifikatlaringiz, darslar qanday o‘tadi" : "Markaz haqida: yo‘nalishlar, guruhlar hajmi, natijalar"}
            className="w-full resize-none rounded-[12px] bg-card2 px-3 py-2.5 text-body outline-none focus:ring-2 focus:ring-tint/40"
          />
          <span className="tnum mt-1 block text-right text-caption text-ink3">{description.length}/1000</span>
        </label>
        <div>
          <Label>Yosh oralig‘i (ixtiyoriy)</Label>
          <div className="flex items-center gap-2">
            <input className={`${field} tnum`} inputMode="numeric" value={ageFrom} onChange={(e) => setAgeFrom(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="6" aria-label="Yoshdan" />
            <span className="text-ink2">–</span>
            <input className={`${field} tnum`} inputMode="numeric" value={ageTo} onChange={(e) => setAgeTo(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="17" aria-label="Yoshgacha" />
          </div>
          {!ageOk && <span className="mt-1 block text-caption text-red-text">Ikkalasini kiriting, «dan» ≤ «gacha»</span>}
        </div>
        <div>
          <Label>Sharoitlar</Label>
          <div className="flex flex-wrap gap-2">
            {AMENITIES.map((a) => (
              <Chip key={a} active={amenities.includes(a)} onClick={() => setAmenities((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))}>
                {a}
              </Chip>
            ))}
          </div>
        </div>
        <p className="text-footnote text-ink2">Guruhlar, bo‘sh joy va narxlar — «Guruhlar» bo‘limida.</p>
      </div>
    </Sheet>
  );
}
