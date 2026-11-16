/* Profil → Kuzatuvlarim: saqlangan qidiruvlar ro‘yxati va o‘chirish */
import { BellRing, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, SkeletonList } from "../../components/motion";
import { listItem } from "../../components/ios/motion";
import { Page } from "../../components/ios/Page";
import { fmtDate } from "../../lib/format";
import { haptic } from "../../lib/telegram";
import type { Watch } from "../../lib/types";
import { watchTitle } from "../../lib/watch";
import { useApp } from "../../store/app";
import { useNav } from "../../store/nav";

export function WatchesPage() {
  const backend = useApp((s) => s.backend);
  const showToast = useApp((s) => s.showToast);
  const setTab = useNav((s) => s.setTab);
  const [list, setList] = useState<Watch[] | null>(null);

  useEffect(() => {
    if (!backend) return;
    return backend.watchWatches(setList);
  }, [backend]);

  const remove = async (w: Watch) => {
    try {
      await backend?.deleteWatch(w.id);
      haptic.success();
      showToast("Kuzatuv o‘chirildi", "ok");
    } catch {
      showToast("O‘chirib bo‘lmadi", "error");
    }
  };

  return (
    <Page title="Kuzatuvlarim" back backLabel="Profil">
      {list === null ? (
        <SkeletonList count={2} />
      ) : list.length ? (
        <div className="mx-4 mt-3 space-y-2.5">
          {list.map((w, i) => (
            <div key={w.id} {...listItem(i)} className="flex items-center gap-3 rounded-card bg-card p-3.5 shadow-card">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tint/10 text-tint" aria-hidden>
                <BellRing size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-headline">{watchTitle(w)}</div>
                <div className="text-footnote text-ink2">{fmtDate(w.createdMs)} dan beri</div>
              </div>
              <button aria-label="O‘chirish" onClick={() => remove(w)} className="focus-ring pressable flex h-11 w-11 items-center justify-center rounded-full bg-red-soft text-red-text">
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          <p className="px-2 text-footnote text-ink2">Mos guruhda bo‘sh joy ochilsa, bot Telegram’da yozadi — kuniga 3 tagacha, bir guruh haqida bir marta.</p>
        </div>
      ) : (
        <EmptyState
          kind="saved"
          title="Kuzatuv yo‘q"
          text="Xaritada fan, masofa va narxni tanlang, so‘ng «Shunday joy ochilsa xabar ber» ni bosing."
          action={{ label: "Xaritaga o‘tish", onClick: () => setTab("map") }}
        />
      )}
    </Page>
  );
}
