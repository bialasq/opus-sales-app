import axios from "axios";
import api from "./api";

const ACCESS_KEY = "opus_access";
const REFRESH_KEY = "opus_refresh";

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

/** Bez interceptorów — unikamy pętli przy /auth/refresh. */
const bareClient = axios.create({
  baseURL: resolveApiRoot(),
  headers: { "Content-Type": "application/json" },
});

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthMe = {
  userId: string;
  organizationId: string;
  role: string;
};

export type RegisterResult = {
  userId: string;
  organizationId: string;
};

export function getAccessToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
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

export async function login(
  email: string,
  password: string
): Promise<AuthTokens> {
  const { data } = await bareClient.post<AuthTokens>("/auth/login", {
    email,
    password,
  });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await bareClient.post("/auth/logout", { refreshToken });
    }
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

/** Odświeża parę tokenów — używane przez interceptor axios w api.ts. */
export async function tryRefreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const { data } = await bareClient.post<AuthTokens>("/auth/refresh", {
      refreshToken,
    });
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}
