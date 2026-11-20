/* 1-bosqich: hali tayyor bo'lmagan ekranlar uchun vaqtinchalik sahifa (2-bosqichda almashtiriladi) */
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePalette } from "@/hooks/usePalette";

export function Placeholder({ title, text }: { title: string; text: string }) {
  const c = usePalette();
  return (
    <SafeAreaView style={[s.root, { backgroundColor: c.background }]}>
      <View style={[s.card, { backgroundColor: c.card }]}>
        <Text style={[s.title, { color: c.text }]}>{title}</Text>
        <Text style={[s.text, { color: c.textSecondary }]}>{text}</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, justifyContent: "center" },
  card: { borderRadius: 18, padding: 20 },
  title: { fontSize: 22, fontWeight: "800" },
  text: { fontSize: 15, marginTop: 8, lineHeight: 21 }
});
