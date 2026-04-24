import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        panel: "0 24px 80px rgba(16, 18, 20, 0.22)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "Fira Code", "Geist Mono", "ui-monospace", "monospace"],
        serif: ["Literata", "Merriweather", "Georgia", "serif"],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pageTurn: {
          "0%": { transform: "rotateY(0deg)" },
          "100%": { transform: "rotateY(-10deg)" },
        },
      },
      animation: {
        shimmer: "shimmer 2.5s linear infinite",
        "fade-up": "fadeUp 420ms ease-out",
        "page-turn": "pageTurn 220ms ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
