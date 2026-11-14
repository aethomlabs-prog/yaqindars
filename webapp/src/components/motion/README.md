# YaqinDars — motion UI paketi

10 ta animatsion komponent. Kutubxonasiz (faqat React + CSS + inline SVG).
Hajmi: JS ≈ 4.9 KB gzip, CSS ≈ 3.5 KB gzip — jami ≈ 8.4 KB.
Animatsiyalar faqat transform/opacity (60 fps). «Harakatni kamaytirish» yoqilsa o‘chadi.
Ranglar Telegram mavzusidan olinadi — yorug‘ va qorong‘i rejimda ishlaydi.

`src/components/motion/` ga nusxalang va `import { … } from "@/components/motion"`.

| # | Komponent | Qayerda | Misol |
|---|-----------|---------|-------|
| 1 | `Splash` | App ildizida, auth tugaguncha | `<Splash ready={authReady} />` |
| 2 | `SuccessSheet` | Ariza yuborilgach | `<SuccessSheet open details={[{label:"Markaz",value:name}]} onClose={…} />` |
| 3 | `EmptyState` | Bo‘sh ro‘yxatlar | `<EmptyState kind="search" action={{label:"Filtrni tozalash",onClick:reset}} />` (`search`, `applications`, `chats`, `saved`) |
| 4 | `pinIcon`, `clusterIcon` | Leaflet markerlari | `L.marker(p,{icon:pinIcon(L, seats>0 ? (vip?"vip":"free") : "full", selected)})`; `markerClusterGroup({iconCreateFunction:c=>clusterIcon(L,c.getChildCount())})` |
| 5 | `IslandProvider`, `useIsland` | Ilova ildizi + istalgan joy | `island({title:"Joy bo‘shadi!", text:"Ingliz tili · 16:00", onTap})` |
| 6 | `TabIcon` | Pastki tab bar | `<TabIcon id="map" active={tab==="map"} />` |
| 7 | `Skeleton`, `SkeletonCard`, `SkeletonList` | Yuklanayotganda | `{loading ? <SkeletonList count={4}/> : …}` |
| 8 | `SeatChip` | Markaz/guruh kartochkalari | `<SeatChip count={group.freeSeats} />` |
| 9 | `PullToRefresh` | Asosiy, Arizalar ro‘yxati | `<PullToRefresh onRefresh={reload}>…</PullToRefresh>` |
| 10 | `Onboarding`, `shouldShowOnboarding` | Birinchi ochilish | `{shouldShowOnboarding() && <Onboarding onDone={…}/>}` |

Muhim:
- PullToRefresh uchun `Telegram.WebApp.disableVerticalSwipes()` chaqirilgan bo‘lsin (aks holda pastga tortish Mini App’ni yopadi).
- Splash’ni kamida ~600 ms ko‘rsating (aks holda chaqnab ketadi).
- Island ilovada bitta bo‘lsin (`IslandProvider` ildizda).
