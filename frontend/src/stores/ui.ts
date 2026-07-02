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
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(THEME_KEY);
      } catch {
        /* brak localStorage */
      }
      this.dark = stored
        ? stored === "dark"
        : window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
      applyDarkClass(this.dark);
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
