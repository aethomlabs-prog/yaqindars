/* YaqinDars brendi — minimal iPhone uslubi. Ranglar packages/shared BRAND bilan bir xil. */
import { BRAND } from "@yaqindars/shared";

export interface Palette {
  tint: string;
  navy: string;
  green: string;
  greenText: string;
  gold: string;
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  separator: string;
  danger: string;
}

export const Colors: { light: Palette; dark: Palette } = {
  light: {
    tint: BRAND.blue,
    navy: BRAND.navy,
    green: BRAND.green,
    greenText: BRAND.greenText,
    gold: BRAND.gold,
    background: BRAND.bg,
    card: "#FFFFFF",
    text: BRAND.ink,
    textSecondary: "#5B6478",
    separator: "rgba(20,33,61,0.10)",
    danger: "#D03B3B"
  },
  dark: {
    tint: "#3987E5",
    navy: "#9CC0F5",
    green: "#2BC883",
    greenText: "#4ADE9A",
    gold: BRAND.gold,
    background: "#0B1220",
    card: "#151E30",
    text: "#F1F4FA",
    textSecondary: "#9AA4B8",
    separator: "rgba(255,255,255,0.10)",
    danger: "#F07070"
  }
};

export const Radius = { card: 18, button: 14, pill: 999 } as const;
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
