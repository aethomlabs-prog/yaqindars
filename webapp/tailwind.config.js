/** Dizayn tokenlari src/index.css dagi CSS o‘zgaruvchilarda; Tailwind ularga murojaat qiladi. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--card)",
        card2: "var(--card2)",
        sep: "var(--sep)",
        ink: "var(--ink)",
        ink2: "var(--ink2)",
        ink3: "var(--ink3)",
        tint: "var(--tint)",
        navy: "var(--navy)",
        fill: "var(--fill)",
        green: { DEFAULT: "#22B573", text: "var(--green-text)", soft: "var(--green-soft)" },
        gold: { DEFAULT: "#F5B700", text: "var(--gold-text)", soft: "var(--gold-soft)" },
        red: { DEFAULT: "#F25C3B", text: "var(--red-text)", soft: "var(--red-soft)" }
      },
      fontFamily: { sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"] },
      fontSize: {
        "large-title": ["34px", { lineHeight: "41px", fontWeight: "700", letterSpacing: "-0.4px" }],
        title: ["22px", { lineHeight: "28px", fontWeight: "700", letterSpacing: "-0.3px" }],
        headline: ["17px", { lineHeight: "22px", fontWeight: "600", letterSpacing: "-0.2px" }],
        body: ["17px", { lineHeight: "22px", fontWeight: "400", letterSpacing: "-0.2px" }],
        subhead: ["15px", { lineHeight: "20px", fontWeight: "400", letterSpacing: "-0.1px" }],
        footnote: ["14px", { lineHeight: "19px", fontWeight: "400" }],
        caption: ["13px", { lineHeight: "17px", fontWeight: "500" }]
      },
      borderRadius: { card: "20px", btn: "14px", sheet: "28px" },
      boxShadow: { card: "0 0 0 1px var(--line)", float: "0 1px 4px rgba(0,0,0,.14)" }
    }
  },
  plugins: []
};
