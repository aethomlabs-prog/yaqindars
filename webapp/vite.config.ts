import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// base: "./" — ilova istalgan papkada (GitHub Pages /yaqindars/, Vercel /) ishlaydi.
export default defineConfig({
  base: "./",
  plugins: [react()],
  // Umumiy mantiq (mobil ilova bilan bir xil): packages/shared
  resolve: { alias: { "@shared": fileURLToPath(new URL("../packages/shared/src", import.meta.url)) } },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/leaflet") || id.includes("react-leaflet") || id.includes("@react-leaflet")) return "map";
          if (id.includes("node_modules/@firebase") || id.includes("node_modules/firebase")) return "firebase";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react";
        }
      }
    }
  }
});
