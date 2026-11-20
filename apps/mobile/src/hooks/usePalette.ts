import { useColorScheme } from "react-native";
import { Colors, type Palette } from "@/constants/theme";

/** Joriy mavzu ranglari (avto: telefon sozlamasi; 2-bosqichda — Profil → Mavzu) */
export function usePalette(): Palette {
  return Colors[useColorScheme() === "dark" ? "dark" : "light"];
}
