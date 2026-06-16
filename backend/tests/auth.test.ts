import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { apiKeyAuth, constantTimeEqual } from "../middleware/auth";

const TEST_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

type MiddlewareResult =
  | { kind: "next" }
  | { kind: "response"; status: number; body: unknown };

function runAuth(
  options: {
    path?: string;
    originalUrl?: string;
    headers?: Record<string, string>;
  } = {}
): MiddlewareResult {
  const headers = options.headers ?? {};
  let status = 200;
  let body: unknown;

  const req = {
    path: options.path ?? "/products/analysis",
    originalUrl: options.originalUrl ?? options.path ?? "/products/analysis",
    ip: "127.0.0.1",
    header(name: string) {
      const key = name.toLowerCase();
      return headers[key] ?? headers[name];
    },
  } as Request;

  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as Response;

  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  apiKeyAuth(req, res, next);

  if (nextCalled) return { kind: "next" };
  return { kind: "response", status, body };
}

describe("constantTimeEqual", () => {
  it("uses constant-time comparison (different lengths → false)", () => {
    expect(constantTimeEqual("short", "longer-string")).toBe(false);
  });

  it("returns true only for equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });
});

describe("apiKeyAuth", () => {
  beforeEach(() => {
    vi.stubEnv("API_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects request without x-api-key header", () => {
    const result = runAuth();
    expect(result).toEqual({
      kind: "response",
      status: 401,
      body: { error: "Missing x-api-key header" },
    });
  });

  it("rejects request with wrong x-api-key", () => {
    const result = runAuth({ headers: { "x-api-key": "wrong-key" } });
    expect(result).toMatchObject({
      kind: "response",
      status: 403,
      body: { error: "Invalid API key" },
    });
  });

  it("accepts request with correct x-api-key", () => {
    const result = runAuth({ headers: { "x-api-key": TEST_KEY } });
    expect(result).toEqual({ kind: "next" });
  });

  it("allows /api/health without key", () => {
    const result = runAuth({
      path: "/health",
      originalUrl: "/api/health",
    });
    expect(result).toEqual({ kind: "next" });
  });

  it("rejects when API_KEY not set in env", () => {
    vi.stubEnv("API_KEY", "");
    const result = runAuth({ headers: { "x-api-key": TEST_KEY } });
    expect(result).toMatchObject({
      kind: "response",
      status: 503,
      body: { error: "Service not configured" },
    });
  });
});
