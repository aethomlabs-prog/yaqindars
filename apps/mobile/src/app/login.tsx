/* yaqindars.uz/login (va yaqindars://login) — Telegram'da tasdiqlagach ilovaga qaytish.
 * Kirishni Profil ekranidagi oqim o'zi yakunlaydi (token hujjatini kuzatadi); bu sahifa faqat Profilga qaytaradi. */
import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { usePalette } from "@/hooks/usePalette";

export default function LoginReturn() {
  const c = usePalette();
  useEffect(() => {
    const t = setTimeout(() => router.replace("/(tabs)/profile"), 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: c.background }}>
      <ActivityIndicator color={c.tint} />
      <Text style={{ color: c.text, fontSize: 16 }}>Kirish yakunlanmoqda…</Text>
    </View>
  );
}
