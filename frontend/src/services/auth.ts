import { ref } from "vue";
import api from "./api";
import axios from "axios";

/**
 * Model sesji (po hardeningu):
 *  - ACCESS token: krótki (15 min), trzymany WYŁĄCZNIE w pamięci JS (nie w localStorage)
 *    — znika po przeładowaniu karty i jest odtwarzany z refresh-cookie (patrz initSession()).
 *  - REFRESH token: httpOnly + Secure cookie ustawiany przez API — niedostępny dla JS,
 *    więc XSS nie może go wykraść. Wysyłany automatycznie przez przeglądarkę na /auth/refresh.
 *
 * Dlatego ten moduł nie dotyka już localStorage dla tokenów.
 */

type RuntimeAppConfig = {
  API_URL?: string;
};

function runtimeConfig(): RuntimeAppConfig {
  if (typeof window !== "undefined") {
    const cfg = (window as Window & { __APP_CONFIG__?: RuntimeAppConfig })
      .__APP_CONFIG__;
    if (cfg) return cfg;
  }
  return {};
}

function resolveApiRoot(): string {
  const runtime = runtimeConfig().API_URL?.trim();
  if (runtime && runtime !== "__API_URL__") {
    return runtime.replace(/\/$/, "");
  }
  const vite = import.meta.env.VITE_API_URL;
  if (!vite || !String(vite).trim()) {
    return "/api";
  }
  let base = String(vite).trim().replace(/\/$/, "");
  if (!/\/api(\/|$)/i.test(base)) {
    try {
      const u = new URL(base);
      const p = (u.pathname || "").replace(/\/$/, "") || "/";
      if (p === "/") {
        base = `${base}/api`;
      }
    } catch {
      if (!base.endsWith("/api")) {
        base = `${base}/api`;
      }
    }
  }
  return base.replace(/\/$/, "");
}

/**
 * Klient bez interceptorów (unikamy pętli przy /auth/refresh).
 * withCredentials=true → przeglądarka dołącza httpOnly refresh-cookie.
 */
const bareClient = axios.create({
  baseURL: resolveApiRoot(),
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

export type AuthMe = {
  userId: string;
  organizationId: string;
  role: string;
};

export type RegisterResult = {
  userId: string;
  organizationId: string;
};

// Access token żyje tylko w pamięci (zerowany przy przeładowaniu strony).
// REAKTYWNY ref — dzięki temu computed-y (np. nagłówki el-upload) odświeżają się,
// gdy token się zmieni (login/refresh). Zwykła zmienna modułowa nie była śledzona przez Vue.
const accessTokenRef = ref<string | null>(null);

export function getAccessToken(): string | null {
  return accessTokenRef.value;
}

function setAccessToken(token: string): void {
  accessTokenRef.value = token;
}

export function clearTokens(): void {
  accessTokenRef.value = null;
}

export function isLoggedIn(): boolean {
  return !!accessTokenRef.value;
}

/**
 * Gwarantuje świeży access token przed operacją, która OMIJA interceptor axios
 * (np. natywny upload el-upload/fetch — nie potrafi sam odświeżyć po 401).
 * Odświeża z httpOnly refresh-cookie. Zwraca true, jeśli mamy ważny token.
 */
export async function ensureFreshToken(): Promise<boolean> {
  const refreshed = await tryRefreshAccessToken();
  return refreshed || !!getAccessToken();
}

export async function register(
  organizationName: string,
  email: string,
  password: string,
  userName?: string
): Promise<RegisterResult> {
  const { data } = await bareClient.post<RegisterResult>("/auth/register", {
    organizationName,
    email,
    password,
    ...(userName?.trim() ? { userName: userName.trim() } : {}),
  });
  return data;
}

export async function login(email: string, password: string): Promise<void> {
  // Serwer ustawia refresh-cookie i zwraca tylko accessToken.
  const { data } = await bareClient.post<{ accessToken: string }>(
    "/auth/login",
    { email, password }
  );
  setAccessToken(data.accessToken);
}

export async function logout(): Promise<void> {
  try {
    // Refresh-cookie idzie automatycznie; serwer go unieważnia i czyści cookie.
    await bareClient.post("/auth/logout", {});
  } catch {
    /* best-effort */
  }
  clearTokens();
}

export async function fetchMe(): Promise<AuthMe> {
  if (!getAccessToken()) {
    throw new Error("Brak tokenu dostępu");
  }
  const { data } = await api.get<AuthMe>("/auth/me");
  return data;
}

/**
 * Odświeża access token na podstawie refresh-cookie.
 * Używane przez interceptor axios (401) oraz przy starcie aplikacji (initSession).
 */
export async function tryRefreshAccessToken(): Promise<boolean> {
  try {
    const { data } = await bareClient.post<{ accessToken: string }>(
      "/auth/refresh",
      {}
    );
    setAccessToken(data.accessToken);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

/**
 * Przy starcie aplikacji próbuje odtworzyć sesję z refresh-cookie.
 * Zwraca true, jeśli użytkownik jest zalogowany (cookie ważne).
 */
export async function initSession(): Promise<boolean> {
  return tryRefreshAccessToken();
}
