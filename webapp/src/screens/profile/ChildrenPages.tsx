/* Farzandlar ro‘yxati va tahrirlash formasi (ariza formasida «Kim uchun?» sifatida chiqadi). */
import { Baby, Plus } from "lucide-react";
import { useState } from "react";
import { SubjectIcon } from "../../components/brand";
import { Avatar, Button, Chip, EmptyState } from "../../components/ios/controls";
import { Row, Section } from "../../components/ios/Grouped";
import { NavIconButton, Page } from "../../components/ios/Page";
import { SUBJECTS } from "../../lib/match";
import { haptic } from "../../lib/telegram";
import { newId, useApp, useProfile } from "../../store/app";
import { useNav } from "../../store/nav";

export function ChildrenPage() {
  const children = useProfile((s) => s.children);
  const push = useNav((s) => s.push);
  return (
    <Page
      title="Farzandlarim"
      back
      backLabel="Profil"
      right={
        <NavIconButton label="Farzand qo‘shish" onClick={() => push({ name: "childEdit", childId: null })}>
          <Plus size={26} />
        </NavIconButton>
      }
    >
      {children.length ? (
        <Section className="mt-3" footer="Arizada farzandingizni bir bosishda tanlaysiz.">
          {children.map((c) => (
            <Row
              key={c.id}
              leading={<Avatar name={c.name} size={40} />}
              title={c.name}
              subtitle={[c.age ? `${c.age} yosh` : null, c.grade ? `${c.grade}-sinf` : null, c.interests.join(", ") || null].filter(Boolean).join(" · ") || "Ma’lumot qo‘shilmagan"}
              chevron
              onClick={() => push({ name: "childEdit", childId: c.id })}
            />
          ))}
        </Section>
      ) : (
        <EmptyState icon={<Baby size={26} />} text="Farzandingizni qo‘shsangiz, arizalar tezroq to‘ldiriladi va AI yoshiga mos markazlarni tavsiya qiladi." action="Farzand qo‘shish" onAction={() => push({ name: "childEdit", childId: null })} />
      )}
    </Page>
  );
}

const field = "h-11 w-full bg-transparent text-body text-ink outline-none placeholder:text-ink3";

export function ChildEditPage({ childId }: { childId: string | null }) {
  const existing = useProfile((s) => s.children.find((c) => c.id === childId));
  const save = useProfile((s) => s.saveChild);
  const remove = useProfile((s) => s.removeChild);
  const showToast = useApp((s) => s.showToast);
  const pop = useNav((s) => s.pop);

  const [name, setName] = useState(existing?.name ?? "");
  const [age, setAge] = useState(existing?.age ? String(existing.age) : "");
  const [grade, setGrade] = useState(existing?.grade ?? "");
  const [interests, setInterests] = useState<string[]>(existing?.interests ?? []);
  const valid = name.trim().length >= 2;

  const submit = () => {
    if (!valid) return;
    const a = parseInt(age, 10);
    save({ id: existing?.id ?? newId(), name: name.trim(), age: a >= 2 && a <= 25 ? a : null, grade: grade.trim(), interests });
    haptic.success();
    showToast(existing ? "Saqlandi" : "Farzand qo‘shildi", "ok");
    pop();
  };

  return (
    <Page
      title={existing ? "Tahrirlash" : "Yangi farzand"}
      back
      backLabel="Orqaga"
      right={
        <button onClick={submit} disabled={!valid} className="focus-ring h-11 px-2 text-headline text-tint disabled:opacity-40">
          Saqlash
        </button>
      }
    >
      <div className="mb-6 mt-2 flex justify-center">
        <Avatar name={name || "?"} size={80} />
      </div>
      <Section>
        <label className="flex items-center gap-3 px-4 [box-shadow:inset_0_-0.5px_0_var(--sep)]">
          <span className="w-20 shrink-0 text-body">Ism</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Masalan, Aziz" autoFocus={!existing} />
        </label>
        <label className="flex items-center gap-3 px-4 [box-shadow:inset_0_-0.5px_0_var(--sep)]">
          <span className="w-20 shrink-0 text-body">Yoshi</span>
          <input className={`${field} tnum`} value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" placeholder="10" />
        </label>
        <label className="flex items-center gap-3 px-4">
          <span className="w-20 shrink-0 text-body">Sinfi</span>
          <input className={`${field} tnum`} value={grade} onChange={(e) => setGrade(e.target.value.slice(0, 10))} placeholder="4" />
        </label>
      </Section>

      <h3 className="mb-2 px-8 text-[13px] uppercase tracking-[0.02em] text-ink2">Qiziqishlari</h3>
      <div className="mx-4 mb-6 flex flex-wrap gap-2">
        {SUBJECTS.filter((s) => s !== "Boshqa").map((s) => {
          const on = interests.includes(s);
          return (
            <Chip key={s} active={on} onClick={() => setInterests(on ? interests.filter((x) => x !== s) : [...interests, s])}>
              {!on && <SubjectIcon name={s} size={20} />}
              {s}
            </Chip>
          );
        })}
      </div>

      <div className="mx-4 space-y-2">
        <Button className="w-full" disabled={!valid} onClick={submit}>
          Saqlash
        </Button>
        {existing && (
          <Button
            kind="plain"
            className="w-full !text-red-text"
            onClick={() => {
              remove(existing.id);
              showToast("O‘chirildi", "ok");
              pop();
            }}
          >
            O‘chirish
          </Button>
        )}
      </div>
    </Page>
  );
}
