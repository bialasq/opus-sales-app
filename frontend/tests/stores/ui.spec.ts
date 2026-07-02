import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useUiStore } from "@/stores/ui";

describe("ui store (theme)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("initTheme honours stored preference", () => {
    localStorage.setItem("opus_theme", "dark");
    const ui = useUiStore();
    ui.initTheme();
    expect(ui.dark).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("toggleDark flips the class and persists", () => {
    const ui = useUiStore();
    ui.initTheme();
    const before = ui.dark;

    ui.toggleDark();

    expect(ui.dark).toBe(!before);
    expect(document.documentElement.classList.contains("dark")).toBe(ui.dark);
    expect(localStorage.getItem("opus_theme")).toBe(
      ui.dark ? "dark" : "light"
    );
  });
});
