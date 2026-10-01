import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // DEFAULT values unchanged so text-navy / bg-gold/10 etc. keep working.
        navy: { DEFAULT: "#1F2A44", 700: "#2A3858", 50: "#EEF0F5" },
        gold: { DEFAULT: "#D9A441", 600: "#B88720", 50: "#FBF3E0" },
        // Apple-style text greys (ink-3 is below AA for small text: meta only).
        ink: { DEFAULT: "#1D1D1F", 2: "#6E6E73", 3: "#86868B" },
        canvas: "#F5F5F7",
        surface: "#FFFFFF",
        line: { DEFAULT: "#E5E5EA", strong: "#D2D2D7" },
        fill: "#F0F0F3",
        ok: "#1E8E3E",
        warn: "#B7791F",
        danger: "#C5221F",
      },
      fontSize: {
        micro: ["12px", { lineHeight: "16px", letterSpacing: "0" }],
        chip: ["13px", { lineHeight: "16px", letterSpacing: "-0.005em" }],
        body: ["14px", { lineHeight: "20px", letterSpacing: "-0.01em" }],
        ui: ["15px", { lineHeight: "22px", letterSpacing: "-0.012em" }],
        title: ["20px", { lineHeight: "26px", letterSpacing: "-0.02em", fontWeight: "600" }],
        display: ["28px", { lineHeight: "32px", letterSpacing: "-0.022em", fontWeight: "600" }],
      },
      borderRadius: {
        chip: "6px",
        ctl: "10px",
        card: "16px",
        modal: "20px",
        pill: "980px",
      },
      boxShadow: {
        pop: "0 8px 24px rgba(29,29,31,.12), 0 0 0 1px rgba(29,29,31,.06)",
        modal: "0 24px 64px rgba(29,29,31,.22)",
      },
      transitionDuration: { fast: "120ms", base: "200ms", slow: "320ms" },
      transitionTimingFunction: {
        apple: "cubic-bezier(0.25, 0.1, 0.25, 1)",
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
