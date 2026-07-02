import { beforeEach, describe, expect, it, vi } from "vitest";

// bareClient w auth.ts powstaje z axios.create — podstawiamy kontrolowany mock.
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", () => ({
  default: { create: () => ({ post: mocks.post }) },
}));
// auth.ts importuje ./api (który ciągnie element-plus) — mockujemy, nie testujemy tu.
vi.mock("@/services/api", () => ({ default: { get: vi.fn() } }));

import {
  clearTokens,
  ensureFreshToken,
  getAccessToken,
  initSession,
  isLoggedIn,
  login,
  logout,
  tryRefreshAccessToken,
} from "@/services/auth";

const SESSION_HINT = "opus_session_hint";

describe("auth service — token lifecycle", () => {
  beforeEach(() => {
    clearTokens();
    localStorage.clear();
    mocks.post.mockReset();
  });

  it("login stores the access token in memory and marks a session hint", async () => {
    mocks.post.mockResolvedValueOnce({ data: { accessToken: "TOKEN_A" } });

    await login("a@b.pl", "haslo12345");

    expect(getAccessToken()).toBe("TOKEN_A");
    expect(isLoggedIn()).toBe(true);
    expect(localStorage.getItem(SESSION_HINT)).toBe("1");
    // Refresh token nie jest zwracany do JS (siedzi w httpOnly cookie).
    expect(mocks.post).toHaveBeenCalledWith("/auth/login", {
      email: "a@b.pl",
      password: "haslo12345",
    });
  });

  it("logout clears the token and the session hint", async () => {
    mocks.post.mockResolvedValueOnce({ data: { accessToken: "T" } });
    await login("a@b.pl", "x");
    mocks.post.mockResolvedValueOnce({ data: { ok: true } });

    await logout();

    expect(getAccessToken()).toBeNull();
    expect(isLoggedIn()).toBe(false);
    expect(localStorage.getItem(SESSION_HINT)).toBeNull();
  });

  it("tryRefreshAccessToken sets a new token on success", async () => {
    mocks.post.mockResolvedValueOnce({ data: { accessToken: "FRESH" } });
    const ok = await tryRefreshAccessToken();
    expect(ok).toBe(true);
    expect(getAccessToken()).toBe("FRESH");
  });

  it("tryRefreshAccessToken clears the token and returns false on failure", async () => {
    mocks.post.mockRejectedValueOnce(new Error("401"));
    const ok = await tryRefreshAccessToken();
    expect(ok).toBe(false);
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem(SESSION_HINT)).toBeNull();
  });

  it("ensureFreshToken refreshes before returning true", async () => {
    mocks.post.mockResolvedValueOnce({ data: { accessToken: "UP_TO_DATE" } });
    const ok = await ensureFreshToken();
    expect(ok).toBe(true);
    expect(mocks.post).toHaveBeenCalledWith("/auth/refresh", {});
  });
});

describe("initSession — skip refresh when no prior session", () => {
  beforeEach(() => {
    clearTokens();
    localStorage.clear();
    mocks.post.mockReset();
  });

  it("does NOT hit the network for a visitor who never logged in", async () => {
    const restored = await initSession();
    expect(restored).toBe(false);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("attempts refresh when a session hint exists", async () => {
    localStorage.setItem(SESSION_HINT, "1");
    mocks.post.mockResolvedValueOnce({ data: { accessToken: "RESTORED" } });

    const restored = await initSession();

    expect(restored).toBe(true);
    expect(mocks.post).toHaveBeenCalledWith("/auth/refresh", {});
    expect(getAccessToken()).toBe("RESTORED");
  });
});
