/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{vue,js,ts}"],
  // Klasa `dark` na <html> — spójna z dark/css-vars Element Plus (stores/ui.ts).
  darkMode: "class",
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        // Helvetica-first: prawdziwa Helvetica na macOS, metrycznie zgodny
        // Arial na Windows (Helvetica nie jest tam instalowana).
        sans: ['"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.06)",
        "card-hover":
          "0 10px 40px -10px rgb(15 23 42 / 0.12), 0 4px 6px -4px rgb(15 23 42 / 0.06)",
      },
      maxWidth: {
        content: "88rem",
      },
    },
  },
  plugins: [],
};
