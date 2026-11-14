/* Profil tabi: iOS «Settings» uslubidagi guruhlangan ro‘yxat. */
import { Baby, Bell, BellRing, ClipboardList, Heart, Info, MapPin, Moon, RotateCcw, Store } from "lucide-react";
import { Avatar, CountBadge, Segmented, Switch } from "../../components/ios/controls";
import { Row, Section } from "../../components/ios/Grouped";
import { Page } from "../../components/ios/Page";
import { openTelegramLink, tgUser } from "../../lib/telegram";
import { displayName, IS_DEMO, useApp, useApplications, useProfile, useSettings, type ThemePref, useBotUsername } from "../../store/app";
import { useNav } from "../../store/nav";

export function ProfileScreen() {
  const push = useNav((s) => s.push);
  const BOT_USERNAME = useBotUsername();
  const children = useProfile((s) => s.children);
  const favorites = useProfile((s) => s.favorites);
  const addresses = useProfile((s) => s.addresses);
  const notify = useProfile((s) => s.notify);
  const setNotify = useProfile((s) => s.setNotify);
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const backend = useApp((s) => s.backend);
  const apps = useApplications();
  const activeApps = apps.filter((a) => a.status === "new" || a.status === "seen").length;

  const resetDemo = () => {
    try {
      localStorage.removeItem("yd-demo-v2");
      localStorage.removeItem("yd-profile-demo");
    } catch {
      /* private rejim */
    }
    location.reload();
  };

  return (
    <Page title="Profil" large>
      <div className="mx-4 mb-6 mt-2 flex items-center gap-4 rounded-card bg-card p-4">
        <Avatar name={displayName()} src={tgUser?.photo_url} size={60} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-title">{[tgUser?.first_name ?? displayName(), tgUser?.last_name].filter(Boolean).join(" ")}</div>
          <div className="truncate text-subhead text-ink2">
            {tgUser?.username ? `@${tgUser.username}` : IS_DEMO ? "DEMO rejim — namuna ma’lumotlar" : backend?.authed ? "Telegram orqali" : "Ma’lumotlar shu qurilmada saqlanadi"}
          </div>
        </div>
      </div>

      <Section>
        <Row icon={<Baby size={17} />} iconBg="#FF9500" title="Farzandlarim" value={children.length || undefined} chevron onClick={() => push({ name: "children" })} />
        <Row icon={<ClipboardList size={17} />} iconBg="#34C759" title="Arizalarim" right={<CountBadge n={activeApps} />} chevron onClick={() => push({ name: "applications" })} />
        <Row icon={<Heart size={17} />} iconBg="#FF3B30" title="Saqlanganlar" value={favorites.length || undefined} chevron onClick={() => push({ name: "favorites" })} />
        <Row icon={<MapPin size={17} />} iconBg="#1E6FD9" title="Manzillarim" value={addresses.length || undefined} chevron onClick={() => push({ name: "addresses" })} />
      </Section>

      <Section header="Bildirishnomalar" footer="Xabarlar Telegram bot orqali keladi.">
        <Row icon={<BellRing size={17} />} iconBg="#FF2D55" title="Bo‘sh joy ochilganda" right={<Switch checked={notify.seats} onChange={(v) => setNotify({ seats: v })} label="Bo‘sh joy ochilganda" />} />
        <Row icon={<Bell size={17} />} iconBg="#5856D6" title="Sinov darsi eslatmasi" right={<Switch checked={notify.reminders} onChange={(v) => setNotify({ reminders: v })} label="Sinov darsi eslatmasi" />} />
      </Section>

      <Section header="Ko‘rinish">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-[7px] bg-[#1C1C1E] text-white dark:bg-[#636366]" aria-hidden>
            <Moon size={17} />
          </span>
          <div className="flex-1">
            <Segmented<ThemePref>
              label="Mavzu"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "auto", label: "Avto" },
                { value: "light", label: "Yorug‘" },
                { value: "dark", label: "Qorong‘i" }
              ]}
            />
          </div>
        </div>
      </Section>

      <Section>
        {BOT_USERNAME && (
          <Row icon={<Store size={17} />} iconBg="#13804F" title="Markazingizni qo‘shing" subtitle="Bot orqali, 1-oy bepul" chevron onClick={() => openTelegramLink(`https://t.me/${BOT_USERNAME}?start=markaz`)} />
        )}
        <Row icon={<Info size={17} />} iconBg="#8E8E93" title="Ilova haqida" chevron onClick={() => push({ name: "about" })} />
      </Section>

      {IS_DEMO && (
        <Section footer="Namuna arizalar, chatlar va profil ma’lumotlari o‘chiriladi.">
          <Row icon={<RotateCcw size={17} />} iconBg="#FF3B30" title="DEMO’ni qaytadan boshlash" danger onClick={resetDemo} />
        </Section>
      )}
    </Page>
  );
}
