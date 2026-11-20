/* Firebase (React Native Firebase, modular API).
 * EXPO_PUBLIC_USE_EMULATOR=1 bo'lsa — kompyuterdagi Firebase Emulator Suite (haqiqiy bazaga tegmasdan sinash).
 * Ilova ichida maxfiy kalit yo'q: Groq, BOT_TOKEN — faqat Cloud Functions'da. */
import { connectAuthEmulator, getAuth } from "@react-native-firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "@react-native-firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "@react-native-firebase/functions";
import { Platform } from "react-native";

const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_EMULATOR === "1";
// Android emulyatori uchun kompyuter manzili — 10.0.2.2; haqiqiy telefon uchun EXPO_PUBLIC_EMULATOR_HOST=192.168.x.x
const HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST || (Platform.OS === "android" ? "10.0.2.2" : "127.0.0.1");

let ready = false;
export function initFirebase() {
  if (ready) return;
  ready = true;
  if (USE_EMULATOR) {
    connectAuthEmulator(getAuth(), `http://${HOST}:9099`);
    connectFirestoreEmulator(getFirestore(), HOST, 8085);
    connectFunctionsEmulator(getFunctions(), HOST, 5001);
  }
}

export const db = () => getFirestore();
export const fns = () => getFunctions();
