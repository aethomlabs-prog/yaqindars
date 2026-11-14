/* Saqlangan manzillar (Uy, Maktab…): masofa shu nuqtalardan hisoblanadi. */
import { Check, Home, MapPin, Plus, School, Trash2 } from "lucide-react";
import { EmptyState, Skeleton } from "../../components/motion";
import { lazy, Suspense, useState } from "react";
import { Button, Chip } from "../../components/ios/controls";
import { Row, Section } from "../../components/ios/Grouped";
import { NavIconButton, Page } from "../../components/ios/Page";
import { Sheet } from "../../components/ios/Sheet";
import { RISHTON } from "../../lib/geo";
import { haptic } from "../../lib/telegram";
import type { Address, LatLng } from "../../lib/types";
import { newId, useApp, useProfile } from "../../store/app";

const MapPicker = lazy(() => import("../map/MapPicker"));
const LABELS = ["Uy", "Maktab", "Bog‘cha", "Buvimlar"];

function AddressEditor({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Address | null }) {
  const userPos = useApp((s) => s.userPos);
  const save = useProfile((s) => s.saveAddress);
  const setActive = useProfile((s) => s.setActiveAddress);
  const showToast = useApp((s) => s.showToast);
  const [label, setLabel] = useState(editing?.label ?? "Uy");
  const [text, setText] = useState(editing?.text ?? "");
  const [pos, setPos] = useState<LatLng>(editing ?? userPos ?? RISHTON);
  const valid = label.trim().length > 0;

  const submit = () => {
    if (!valid) return;
    const a: Address = { id: editing?.id ?? newId(), label: label.trim().slice(0, 30), text: text.trim().slice(0, 120) || "Xaritada belgilangan", lat: pos.lat, lng: pos.lng };
    save(a);
    if (!editing) setActive(a.id);
    haptic.success();
    showToast("Manzil saqlandi", "ok");
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title={editing ? "Manzilni tahrirlash" : "Yangi manzil"}
      left={
        <button onClick={onClose} className="h-11 px-1 text-body text-tint">
          Bekor
        </button>
      }
      right={
        <button onClick={submit} disabled={!valid} className="h-11 px-1 text-headline text-tint disabled:opacity-40">
          Saqlash
        </button>
      }
    >
      <div className="flex h-full flex-col gap-4 px-4 pb-4">
        <div className="h-[42vh] min-h-[240px] shrink-0">
          <Suspense
            fallback={
              <Skeleton w="100%" h={9999} r={20} style={{ height: "100%" }} />
            }
          >
            {open && <MapPicker initial={pos} onChange={setPos} />}
          </Suspense>
        </div>
        <p className="-mt-2 text-center text-footnote text-ink2">Xaritani surib, pinni kerakli joyga qo‘ying</p>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {LABELS.map((l) => (
            <Chip key={l} active={label === l} onClick={() => setLabel(l)}>
              {l}
            </Chip>
          ))}
        </div>
        <div className="overflow-hidden rounded-[12px] bg-card2">
          <label className="flex items-center gap-3 px-3.5 [box-shadow:inset_0_-0.5px_0_var(--sep)]">
            <span className="w-16 shrink-0 text-body">Nomi</span>
            <input className="h-11 flex-1 bg-transparent text-body outline-none placeholder:text-ink3" value={label} onChange={(e) => setLabel(e.target.value.slice(0, 30))} placeholder="Uy" />
          </label>
          <label className="flex items-center gap-3 px-3.5">
            <span className="w-16 shrink-0 text-body">Izoh</span>
            <input className="h-11 flex-1 bg-transparent text-body outline-none placeholder:text-ink3" value={text} onChange={(e) => setText(e.target.value.slice(0, 120))} placeholder="Ko‘cha, mahalla (ixtiyoriy)" />
          </label>
        </div>
      </div>
    </Sheet>
  );
}

export function AddressesPage() {
  const addresses = useProfile((s) => s.addresses);
  const activeId = useProfile((s) => s.activeAddressId);
  const setActive = useProfile((s) => s.setActiveAddress);
  const remove = useProfile((s) => s.removeAddress);
  const [editor, setEditor] = useState<{ open: boolean; editing: Address | null; key: number }>({ open: false, editing: null, key: 0 });
  const [editMode, setEditMode] = useState(false);

  const open = (editing: Address | null) => setEditor((e) => ({ open: true, editing, key: e.key + 1 }));

  return (
    <Page
      title="Manzillarim"
      back
      backLabel="Orqaga"
      right={
        <>
          {addresses.length > 0 && (
            <button onClick={() => setEditMode((v) => !v)} className="focus-ring h-11 px-1 text-body text-tint">
              {editMode ? "Tayyor" : "Tahrir"}
            </button>
          )}
          <NavIconButton label="Manzil qo‘shish" onClick={() => open(null)}>
            <Plus size={26} />
          </NavIconButton>
        </>
      }
    >
      {addresses.length ? (
        <Section className="mt-3" footer="Belgilangan manzil bo‘yicha masofa va «eng yaqin» saralash hisoblanadi.">
          {addresses.map((a) => (
            <Row
              key={a.id}
              icon={/uy/i.test(a.label) ? <Home size={17} /> : /maktab|bog/i.test(a.label) ? <School size={17} /> : <MapPin size={17} />}
              iconBg={/uy/i.test(a.label) ? "#1E6FD9" : "#13804F"}
              title={a.label}
              subtitle={a.text}
              right={
                editMode ? (
                  <button
                    aria-label={`${a.label} manzilini o‘chirish`}
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(a.id);
                    }}
                    className="flex h-9 w-9 items-center justify-center text-[#FF3B30]"
                  >
                    <Trash2 size={19} />
                  </button>
                ) : activeId === a.id ? (
                  <Check size={20} strokeWidth={2.6} className="text-tint" aria-label="Tanlangan" />
                ) : undefined
              }
              onClick={() => (editMode ? open(a) : (haptic.selection(), setActive(activeId === a.id ? null : a.id)))}
            />
          ))}
        </Section>
      ) : (
        <EmptyState kind="saved" title="Manzillar yo‘q" text="Uy yoki maktab manzilini qo‘shing — masofa aynan shu joydan hisoblanadi." action={{ label: "Manzil qo‘shish", onClick: () => open(null) }} />
      )}
      {addresses.length > 0 && !editMode && (
        <div className="mx-4">
          <Button kind="tinted" className="w-full" onClick={() => open(null)}>
            <Plus size={19} /> Yangi manzil
          </Button>
        </div>
      )}
      <AddressEditor key={editor.key} open={editor.open} editing={editor.editing} onClose={() => setEditor((e) => ({ ...e, open: false }))} />
    </Page>
  );
}
