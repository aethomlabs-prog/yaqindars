/* Profil (1-bosqich): sessiya holati, «🏫 Markaz bo'lib kirish» (Telegram orqali), «Markaz rejimidan chiqish».
 * Farzandlar, arizalar, saqlanganlar, mavzu va boshqalar — 2-bosqichda. */
import { CONTACT } from "@yaqindars/shared";
import * as Linking from "expo-linking";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePalette } from "@/hooks/usePalette";
import { leaveCenterMode, useSession } from "@/lib/session";
import { loginErrorText, loginWithTelegram, type LoginStep } from "@/lib/tgLogin";

const STEP_TEXT: Record<LoginStep, string> = {
  creating: "Kirish havolasi tayyorlanmoqda…",
  waiting: "Telegram’da «Start» ni bosing, so‘ng shu yerga qayting…",
  finishing: "Kirish yakunlanmoqda…",
  done: "Tayyor!"
};

export default function Profile() {
  const c = usePalette();
  const session = useSession();
  const [step, setStep] = useState<LoginStep | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const login = () => {
    const { promise, cancel } = loginWithTelegram(setStep);
    cancelRef.current = cancel;
    promise
      .then((r) => {
        setStep(null);
        Alert.alert(
          "✅ Kirdingiz",
          r.admin ? "Admin rejimi yoqildi." : r.centers ? "Markazingiz kabinetga ulandi." : "Endi markazingizni ro‘yxatdan o‘tkazishingiz mumkin."
        );
      })
      .catch((e) => {
        setStep(null);
        if (!/Bekor qilindi/.test(String(e?.message))) Alert.alert("Kirib bo‘lmadi", loginErrorText(e));
      });
  };

  const leave = () =>
    Alert.alert("Markaz rejimidan chiqish", "Ilova oddiy (ota-ona) rejimiga qaytadi. Markaz ma’lumotlari o‘chmaydi — qayta kirish mumkin.", [
      { text: "Bekor qilish", style: "cancel" },
      { text: "Chiqish", style: "destructive", onPress: () => leaveCenterMode() }
    ]);

  const card = [s.card, { backgroundColor: c.card }];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={["top"]}>
      <ScrollView contentContainerStyle={s.page}>
        <Text style={[s.h1, { color: c.text }]}>Profil</Text>

        {session.anon ? (
          <View style={card}>
            <Text style={[s.title, { color: c.text }]}>Kirish shart emas</Text>
            <Text style={[s.text, { color: c.textSecondary }]}>
              Arizalaringiz, saqlanganlar va kuzatuvlar shu telefonga bog‘langan. Ilovani o‘chirsangiz, bu ma’lumotlar yo‘qoladi.
            </Text>
          </View>
        ) : (
          <View style={card}>
            <Text style={[s.title, { color: c.text }]}>{session.admin ? "🛡 Admin rejimi" : "🏫 Markaz rejimi"}</Text>
            <Text style={[s.text, { color: c.textSecondary }]}>Telegram orqali kirgansiz (ID: {session.tgId}).</Text>
            <Pressable onPress={leave} style={({ pressed }) => [s.btn, { backgroundColor: c.background, opacity: pressed ? 0.7 : 1 }]}>
              <Text style={[s.btnText, { color: c.danger }]}>Markaz rejimidan chiqish</Text>
            </Pressable>
          </View>
        )}

        {session.anon && (
          <View style={card}>
            <Text style={[s.title, { color: c.text }]}>Markaz yoki repetitormisiz?</Text>
            <Text style={[s.text, { color: c.textSecondary }]}>
              Telegram orqali bir bosishda kiring — SMS va parol kerak emas. Ro‘yxatdan o‘tgan markazingiz kabinetga o‘zi ulanadi.
            </Text>
            {step ? (
              <View style={s.row}>
                <ActivityIndicator color={c.tint} />
                <Text style={[s.text, { color: c.text, flex: 1, marginTop: 0 }]}>{STEP_TEXT[step]}</Text>
                <Pressable onPress={() => cancelRef.current?.()} hitSlop={10}>
                  <Text style={{ color: c.tint, fontWeight: "600" }}>Bekor</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={login}
                disabled={!session.uid}
                accessibilityRole="button"
                style={({ pressed }) => [s.btn, { backgroundColor: c.tint, opacity: !session.uid ? 0.5 : pressed ? 0.8 : 1 }]}
              >
                <Text style={[s.btnText, { color: "#fff" }]}>🏫 Markaz bo‘lib kirish</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={card}>
          <Text style={[s.title, { color: c.text }]}>Admin bilan bog‘lanish</Text>
          <Pressable onPress={() => Linking.openURL(`https://t.me/${CONTACT.adminTelegram}`)} style={s.link}>
            <Text style={{ color: c.tint, fontSize: 16 }}>Telegram: @{CONTACT.adminTelegram}</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(`tel:${CONTACT.adminPhone.replace(/\s/g, "")}`)} style={s.link}>
            <Text style={{ color: c.tint, fontSize: 16 }}>{CONTACT.adminPhone}</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(`https://t.me/${CONTACT.channel}`)} style={s.link}>
            <Text style={{ color: c.tint, fontSize: 16 }}>Kanalimiz: @{CONTACT.channel}</Text>
          </Pressable>
        </View>

        {session.offline && <Text style={[s.text, { color: c.danger, textAlign: "center" }]}>Internet yo‘q — ulanish kutilmoqda…</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  h1: { fontSize: 34, fontWeight: "800", marginBottom: 4 },
  card: { borderRadius: 18, padding: 16 },
  title: { fontSize: 17, fontWeight: "700" },
  text: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  btn: { marginTop: 14, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  btnText: { fontSize: 17, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  link: { minHeight: 44, justifyContent: "center" }
});
