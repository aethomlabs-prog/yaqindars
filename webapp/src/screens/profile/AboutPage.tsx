import { ExternalLink, MessageCircle, ShieldCheck, Store } from "lucide-react";
import { BOT_USERNAME } from "../../../config";
import { LogoMark } from "../../components/brand";
import { Row, Section } from "../../components/ios/Grouped";
import { Page } from "../../components/ios/Page";
import { openLink, openTelegramLink } from "../../lib/telegram";
import { IS_DEMO, useApp } from "../../store/app";

export function AboutPage() {
  const backend = useApp((s) => s.backend);
  return (
    <Page title="Ilova haqida" back backLabel="Profil">
      <div className="flex flex-col items-center px-8 pb-8 pt-4 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-[26px] bg-card shadow-card">
          <LogoMark size={60} />
        </div>
        <h1 className="mt-4 text-title">YaqinDars</h1>
        <p className="mt-1 text-subhead text-ink2">Versiya 2.0 · {IS_DEMO ? "DEMO" : backend?.authed ? "Telegram orqali" : "Mehmon rejimi"}</p>
        <p className="mt-4 text-body text-ink2">Uyingizga yaqin o‘quv markazlari, to‘garaklar va repetitorlar — bo‘sh joylar, narxlar va jadval bilan. Birinchi hudud — Rishton tumani.</p>
      </div>

      <Section header="Ota-onalar uchun" footer="Servis ota-onalar uchun bepul.">
        <Row icon={<ShieldCheck size={17} />} iconBg="#34C759" title="Telefon raqamingiz faqat siz tanlagan markazga yuboriladi" />
        <Row icon={<MessageCircle size={17} />} iconBg="#1E6FD9" title="Markazlar javobi Telegram’da keladi" />
      </Section>

      <Section header="Markazlar uchun" footer="1-oy bepul, keyin Oddiy — 75 000 so‘m/oy, VIP — 150 000 so‘m/oy.">
        <Row
          icon={<Store size={17} />}
          iconBg="#13804F"
          title="Markazni ro‘yxatdan o‘tkazish"
          subtitle={BOT_USERNAME ? `@${BOT_USERNAME} → /markaz` : "Botda /markaz buyrug‘i"}
          chevron={!!BOT_USERNAME}
          onClick={BOT_USERNAME ? () => openTelegramLink(`https://t.me/${BOT_USERNAME}?start=markaz`) : undefined}
        />
      </Section>

      <Section footer="Xarita ma’lumotlari © OpenStreetMap hissadorlari.">
        <Row icon={<ExternalLink size={17} />} iconBg="#8E8E93" title="OpenStreetMap" chevron onClick={() => openLink("https://www.openstreetmap.org/copyright")} />
      </Section>
    </Page>
  );
}
