/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        wasit: {
          bg: "#FAF9F6",
          ink: "#17181C",
          gold: "#F3CE72",
          amber: "#D97706",
          red: "#E11D2E",
          yellow: "#FFC700",
          muted: "#64748B",
          line: "#E2E8F0",
        },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)"],
        body: ["var(--font-manrope)"],
      },
    },
  },
  plugins: [],
};
