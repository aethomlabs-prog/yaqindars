/* Masofa hisoblanadigan nuqtani tanlash: joriy GPS, saqlangan manzillar yoki Rishton markazi. */
import { Check, Home, LocateFixed, MapPin, Settings2 } from "lucide-react";
import { Row } from "../../components/ios/Grouped";
import { Sheet } from "../../components/ios/Sheet";
import { haptic } from "../../lib/telegram";
import { useApp, useOrigin, useProfile } from "../../store/app";
import { useNav } from "../../store/nav";

export function AddressSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addresses = useProfile((s) => s.addresses);
  const setActive = useProfile((s) => s.setActiveAddress);
  const locate = useApp((s) => s.locate);
  const locating = useApp((s) => s.locating);
  const userPos = useApp((s) => s.userPos);
  const push = useNav((s) => s.push);
  const { source } = useOrigin();
  const activeId = useProfile((s) => s.activeAddressId);

  const tick = <Check size={20} strokeWidth={2.6} className="text-tint" aria-label="Tanlangan" />;

  return (
    <Sheet open={open} onClose={onClose} title="Qayerdan hisoblaymiz?">
      <p className="px-6 pb-3 text-center text-footnote text-ink2">Masofa va «eng yaqin» saralash shu nuqtadan hisoblanadi.</p>
      <div className="mx-4 overflow-hidden rounded-card bg-card2">
        <Row
          icon={locating ? <span className="app-busy" aria-label="Aniqlanmoqda"><i /><i /><i /></span> : <LocateFixed size={17} />}
          iconBg="#1E6FD9"
          title="Joriy joylashuv"
          subtitle={userPos ? "GPS bo‘yicha" : "Ruxsat so‘raladi"}
          right={source === "gps" ? tick : undefined}
          onClick={async () => {
            const p = await locate(true);
            if (p) {
              haptic.success();
              onClose();
            }
          }}
        />
        {addresses.map((a) => (
          <Row
            key={a.id}
            icon={a.label.toLowerCase().includes("uy") ? <Home size={17} /> : <MapPin size={17} />}
            iconBg="#13804F"
            title={a.label}
            subtitle={a.text}
            right={activeId === a.id ? tick : undefined}
            onClick={() => {
              haptic.selection();
              setActive(a.id);
              onClose();
            }}
          />
        ))}
        <Row
          icon={<MapPin size={17} />}
          iconBg="#8E8E93"
          title="Rishton markazi"
          subtitle="Standart nuqta"
          right={source === "default" ? tick : undefined}
          onClick={() => {
            haptic.selection();
            setActive(null);
            useApp.setState({ userPos: null });
            onClose();
          }}
        />
      </div>
      <div className="mx-4 mt-4 mb-2 overflow-hidden rounded-card bg-card2">
        <Row
          icon={<Settings2 size={17} />}
          iconBg="#6B7280"
          title="Manzillarni boshqarish"
          chevron
          onClick={() => {
            onClose();
            push({ name: "addresses" }, "profile");
          }}
        />
      </div>
    </Sheet>
  );
}
