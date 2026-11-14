import type { CSSProperties } from "react";

/**
 * 7. Skelet yuklanish (yaltiroq).
 * {loading ? <SkeletonList count={4} /> : <List/>}
 */
export function Skeleton({ w = "100%", h = 14, r = 8, style }: { w?: number | string; h?: number; r?: number; style?: CSSProperties }) {
  return <span className="yd-skel" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

export function SkeletonCard() {
  return (
    <div className="yd-skel-card" aria-hidden="true">
      <Skeleton w={48} h={48} r={14} />
      <div className="yd-skel-lines">
        <Skeleton w="62%" h={16} />
        <Skeleton w="40%" h={12} />
        <Skeleton w="78%" h={12} />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="yd-skel-list" role="status" aria-label="Yuklanmoqda">
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
