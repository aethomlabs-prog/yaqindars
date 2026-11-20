import { create } from "zustand";
import { EMPTY_FILTERS, PRICE_MAX, PRICE_MIN, type Filters } from "@shared/filters";

/* Sof filtrlash (filterCenters, AGE_GROUPS…) — packages/shared da; bu yerda faqat ilova holati. */
export * from "@shared/filters";

const EMPTY: Filters = EMPTY_FILTERS;

interface FilterStore extends Filters {
  set: (patch: Partial<Filters>) => void;
  reset: () => void;
}

export const useFilters = create<FilterStore>((set) => ({
  ...EMPTY,
  set: (patch) => set(patch),
  reset: () => set({ priceMin: PRICE_MIN, priceMax: PRICE_MAX, days: [], freeOnly: false, age: null })
}));

