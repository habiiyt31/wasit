/** @type {import('tailwindcss').Config} */
// Proportions are golden-ratio derived: the type scale steps by 1.618
// from a 16px base, and the spacing scale is the Fibonacci sequence the
// ratio converges from. Both are used directly as Tailwind tokens so a
// stray arbitrary value stands out in review.
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Chalk lines on a pitch. The three status colors are the
        // referee's cards, and they carry meaning rather than decorate:
        // turf = released, yellow = disputed, red = refunded.
        chalk: "#F7F8F5",
        paper: "#FFFFFF",
        stone: "#EDF0EA",
        pitch: "#10312A",
        muted: "#5A6F68",
        turf: "#1F6F4A",
        booking: "#F2C230",
        sending: "#D7263D",
        line: "#D6DDD3",
      },
      fontFamily: {
        display: ["var(--font-archivo)"],
        body: ["var(--font-karla)"],
        mono: ["var(--font-mono)"],
      },
      fontSize: {
        xs: ["12.4px", { lineHeight: "1.5" }],
        base: ["16px", { lineHeight: "1.55" }],
        m: ["25.9px", { lineHeight: "1.2" }],
        l: ["41.9px", { lineHeight: "1.08" }],
        xl: ["67.8px", { lineHeight: "1.02" }],
      },
      spacing: {
        f1: "8px",
        f2: "13px",
        f3: "21px",
        f4: "34px",
        f5: "55px",
        f6: "89px",
      },
    },
  },
  plugins: [],
};
