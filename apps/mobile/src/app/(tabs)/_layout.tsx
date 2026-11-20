/* Tab bar: Asosiy · Xarita · Chat · Profil (animatsiyali ikonkalar — 2-bosqichda) */
import { Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { usePalette } from "@/hooks/usePalette";

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 20, color }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.tint,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.separator }
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Asosiy", tabBarIcon: icon("⌂") }} />
      <Tabs.Screen name="map" options={{ title: "Xarita", tabBarIcon: icon("◎") }} />
      <Tabs.Screen name="chat" options={{ title: "Chat", tabBarIcon: icon("✉") }} />
      <Tabs.Screen name="profile" options={{ title: "Profil", tabBarIcon: icon("☺") }} />
    </Tabs>
  );
}
