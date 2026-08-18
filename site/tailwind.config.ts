import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0E0E0C",
        paper: "#F4F2EC",
        graytone: "#5B5B54",
        faint: "#64645C",
        accent: "#C0341D",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.045em",
        label: "0.18em",
      },
      maxWidth: {
        grid: "1680px",
      },
    },
  },
  plugins: [],
};

export default config;
