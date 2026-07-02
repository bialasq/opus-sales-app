import { defineStore } from "pinia";
import type { AuthMeResponse } from "@shared/api-types";
import {
  fetchMe,
  initSession,
  isLoggedIn as hasAccessToken,
  logout as logoutService,
} from "@/services/auth";

/**
 * Stan zalogowanego użytkownika (kto, jaka rola, jaka organizacja).
 * Sam token żyje w services/auth (pamięć + httpOnly cookie) — store trzyma
 * wyłącznie profil do wyświetlania i decyzji UI (np. widoczność panelu Admin).
 */
export const useAuthStore = defineStore("auth", {
  state: () => ({
    me: null as AuthMeResponse | null,
    /** true po zakończeniu bootstrapu sesji (router może polegać na stanie). */
    ready: false,
  }),

  getters: {
    // isLoggedIn śledzi reaktywny ref tokenu w services/auth.
    isLoggedIn: () => hasAccessToken(),
    role: (s) => s.me?.role ?? null,
    isAdmin: (s) => s.me?.role === "OWNER" || s.me?.role === "ADMIN",
    displayName: (s) => s.me?.name || s.me?.email || "Konto",
  },

  actions: {
    async loadMe(): Promise<AuthMeResponse> {
      const me = await fetchMe();
      this.me = me;
      return me;
    },

    /** Odtworzenie sesji z refresh-cookie przy starcie aplikacji. */
    async bootstrap(): Promise<boolean> {
      try {
        const restored = await initSession();
        if (restored) {
          await this.loadMe().catch(() => {});
        }
        return restored;
      } finally {
        this.ready = true;
      }
    },

    async logout(): Promise<void> {
      await logoutService();
      this.me = null;
    },

    /** Wywoływane przez interceptor api przy definitywnym 401. */
    clear(): void {
      this.me = null;
    },
  },
});
