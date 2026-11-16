/* Admin: markazni tez qo‘shish — nomi, xaritadagi pin, telefon, fanlar (ixtiyoriy), narx (ixtiyoriy).
 * Saqlanadi: source "admin", claimed false → xaritada «Ma’lumot tasdiqlanmagan» belgisi bilan. */
import { Suspense, lazy, useState } from "react";
import { Button, Chip } from "../components/ios/controls";
import { Sheet } from "../components/ios/Sheet";
import { normalizePhone } from "../lib/format";
import { RISHTON } from "../lib/geo";
import { SUBJECTS } from "../lib/match";
import type { LatLng } from "../lib/types";
import { useApp } from "../store/app";

const MapPicker = lazy(() => import("../screens/map/MapPicker"));

const field = "h-11 w-full rounded-[12px] bg-card2 px-3 text-body outline-none focus:ring-2 focus:ring-tint/40";

export function QuickAddSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string, name: string) => void }) {
  const api = useApp((s) => s.backend?.admin);
  const showToast = useApp((s) => s.showToast);
  const userPos = useApp((s) => s.userPos);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pos, setPos] = useState<LatLng>(userPos ?? RISHTON);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  const phoneOk = normalizePhone(phone);
  const priceN = Number(price.replace(/\D/g, "")) || 0;
  const priceOk = !price || (priceN >= 10000 && priceN <= 10000000);
  const valid = name.trim().length >= 2 && !!phoneOk && priceOk;

  const save = async () => {
    if (!api || !valid) return;
    setBusy(true);
    try {
      const id = await api.addCenter({ name: name.trim(), lat: pos.lat, lng: pos.lng, phone: phoneOk!, subjects, price: priceN });
      onSaved(id, name.trim());
      setName("");
      setPhone("");
      setSubjects([]);
      setPrice("");
    } catch (e) {
      console.error(e);
      showToast("Saqlanmadi (ruxsat yoki internet)", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title="Markaz qo‘shish"
      footer={
        <Button className="w-full" disabled={!valid} loading={busy} onClick={save}>
          Xaritaga qo‘shish
        </Button>
      }
    >
      <div className="space-y-4 px-4 pb-4">
        <label className="block">
          <span className="mb-1.5 block text-footnote font-semibold text-ink2">Nomi</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Masalan: Zukko o‘quv markazi" />
        </label>
        <div>
          <span className="mb-1.5 block text-footnote font-semibold text-ink2">Xaritadagi joyi — xaritani suring, pin markaz ustida tursin</span>
          <div className="h-[240px]">
            {open && (
              <Suspense fallback={<div className="h-full rounded-card bg-card2" />}>
                <MapPicker initial={pos} onChange={setPos} />
              </Suspense>
            )}
          </div>
          <p className="tnum mt-1 text-caption text-ink3">
            {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-footnote font-semibold text-ink2">Telefon</span>
          <input className={`${field} tnum`} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
          {phone && !phoneOk && <span className="mt-1 block text-caption text-red-text">Raqam noto‘g‘ri</span>}
        </label>
        <div>
          <span className="mb-1.5 block text-footnote font-semibold text-ink2">Fanlar (ixtiyoriy)</span>
          <div className="flex flex-wrap gap-2">
            {SUBJECTS.map((s) => (
              <Chip key={s} active={subjects.includes(s)} onClick={() => setSubjects((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]))}>
                {s}
              </Chip>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-footnote font-semibold text-ink2">Oylik narx, so‘m (ixtiyoriy)</span>
          <input
            className={`${field} tnum`}
            inputMode="numeric"
            value={priceN ? priceN.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") : price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="250 000"
          />
          {!priceOk && <span className="mt-1 block text-caption text-red-text">10 000 – 10 000 000 oralig‘ida</span>}
        </label>
        <p className="text-footnote text-ink2">
          Markaz «Ma’lumot tasdiqlanmagan» belgisi bilan chiqadi. Egasi ilovada «Bu mening markazim» ni bosadi yoki botda siz bergan kod bilan <b>/claim</b> qiladi.
        </p>
      </div>
    </Sheet>
  );
}
