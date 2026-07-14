import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", "html:not(.theme-light)"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070b0f",
          900: "#0b1117",
          800: "#111a23",
          700: "#1a2530",
          600: "#243240",
          500: "#37485a",
        },
        mint: {
          300: "#7ef0c6",
          400: "#4fe3ad",
          500: "#2bd396",
          600: "#1cae7a",
        },
        ice: {
          100: "#eef4f8",
          200: "#dbe7ef",
          300: "#b9cedd",
          400: "#8fabc0",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
