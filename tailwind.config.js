/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#741A2F",
          50: "#FBEEF1",
          100: "#F4D3DA",
          200: "#E5A2B0",
          300: "#D27085",
          400: "#A93D58",
          500: "#741A2F",
          600: "#5E1526",
          700: "#47101D",
          800: "#310B14",
          900: "#1B060B",
        },
        peach: {
          DEFAULT: "#FFC6A8",
          50: "#FFF4ED",
          100: "#FFE7D6",
          200: "#FFC6A8",
          300: "#FFA679",
          400: "#FF854B",
        },
        cream: "#FFF8F4",
        ink: "#2B2B2B",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        display: ['"Space Grotesk"', '"Inter"', "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      boxShadow: {
        soft: "0 4px 20px -8px rgba(116, 26, 47, 0.12), 0 2px 6px -2px rgba(0,0,0,0.04)",
        card: "0 10px 30px -12px rgba(116, 26, 47, 0.18)",
        glow: "0 0 0 1px rgba(116,26,47,0.08), 0 20px 50px -20px rgba(116,26,47,0.35)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #741A2F 0%, #A93D58 100%)",
        "warm-gradient": "linear-gradient(135deg, #FFC6A8 0%, #FFF8F4 100%)",
      },
    },
  },
  plugins: [],
};
