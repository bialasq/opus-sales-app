import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const authMocks = vi.hoisted(() => ({
  fetchMe: vi.fn(),
  initSession: vi.fn(),
  isLoggedIn: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/services/auth", () => authMocks);

import { useAuthStore } from "@/stores/auth";

const ME = {
  userId: "u1",
  organizationId: "o1",
  role: "OWNER" as const,
  email: "owner@firma.pl",
  name: "Ola",
  organizationName: "Firma",
};

describe("auth store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("bootstrap loads profile when session restored from cookie", async () => {
    authMocks.initSession.mockResolvedValue(true);
    authMocks.fetchMe.mockResolvedValue(ME);

    const auth = useAuthStore();
    const restored = await auth.bootstrap();

    expect(restored).toBe(true);
    expect(auth.me?.email).toBe("owner@firma.pl");
    expect(auth.isAdmin).toBe(true);
    expect(auth.displayName).toBe("Ola");
    expect(auth.ready).toBe(true);
  });

  it("bootstrap without session leaves store empty but ready", async () => {
    authMocks.initSession.mockResolvedValue(false);

    const auth = useAuthStore();
    const restored = await auth.bootstrap();

    expect(restored).toBe(false);
    expect(auth.me).toBeNull();
    expect(authMocks.fetchMe).not.toHaveBeenCalled();
    expect(auth.ready).toBe(true);
  });

  it("MEMBER is not admin", async () => {
    authMocks.fetchMe.mockResolvedValue({ ...ME, role: "MEMBER" });
    const auth = useAuthStore();
    await auth.loadMe();
    expect(auth.isAdmin).toBe(false);
  });

  it("logout clears profile", async () => {
    authMocks.fetchMe.mockResolvedValue(ME);
    authMocks.logout.mockResolvedValue(undefined);

    const auth = useAuthStore();
    await auth.loadMe();
    await auth.logout();

    expect(authMocks.logout).toHaveBeenCalled();
    expect(auth.me).toBeNull();
  });
});
