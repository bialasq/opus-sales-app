import { defineStore } from "pinia";

const THEME_KEY = "opus_theme";

function applyDarkClass(dark: boolean): void {
  // Jedna klasa `dark` na <html> zasila i Tailwind (darkMode: "class"),
  // i Element Plus (dark/css-vars.css).
  document.documentElement.classList.toggle("dark", dark);
}

/** Preferencje interfejsu — na razie motyw; łatwo rozszerzyć (język, gęstość). */
export const useUiStore = defineStore("ui", {
  state: () => ({
    dark: false,
  }),

  actions: {
    /** Wywołać raz przy starcie, przed zamontowaniem aplikacji. */
    initTheme(): void {
      // Aplikacja jest jasna (styl CRM). Przełącznik ciemnego motywu został
      // usunięty z UI, więc ignorujemy też zapisany wybór — inaczej ktoś
      // z historycznym "dark" w localStorage utknąłby w ciemnym motywie.
      this.dark = false;
      try {
        localStorage.removeItem(THEME_KEY);
      } catch {
        /* brak localStorage */
      }
      applyDarkClass(false);
    },

    toggleDark(): void {
      this.dark = !this.dark;
      applyDarkClass(this.dark);
      try {
        localStorage.setItem(THEME_KEY, this.dark ? "dark" : "light");
      } catch {
        /* brak localStorage */
      }
    },
  },
});
