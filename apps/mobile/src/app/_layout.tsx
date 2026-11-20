/* Ilova ildizi: Firebase, ko'rinmas anonim sessiya, mavzu, navigatsiya. */
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { Colors } from "@/constants/theme";
import { initFirebase } from "@/lib/firebase";
import { startSession, useSession } from "@/lib/session";

SplashScreen.preventAutoHideAsync();
initFirebase();

export const unstable_settings = { anchor: "(tabs)" };

export default function RootLayout() {
  const scheme = useColorScheme();
  const ready = useSession((s) => s.ready);

  useEffect(() => startSession(), []);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  const c = Colors[scheme === "dark" ? "dark" : "light"];
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: c.tint, background: c.background, card: c.card, text: c.text, border: c.separator } }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ presentation: "modal" }} />
      </Stack>
    </ThemeProvider>
  );
}
