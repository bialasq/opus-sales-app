import type { Application } from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

function authHeaders(): { "x-api-key": string } {
  return { "x-api-key": process.env.API_KEY! };
}

type AuthRole = "OWNER" | "ADMIN" | "MEMBER";

/** Bearer z organizationId — wymagany przez requireOrg na /api/upload. */
function bearerHeaders(role: AuthRole = "MEMBER"): { Authorization: string } {
  const token = jwt.sign(
    { sub: "test-user-id", org: "org_test_upload", role },
    process.env.JWT_SECRET!,
    { expiresIn: "15m" }
  );
  return { Authorization: `Bearer ${token}` };
}

describe("HTTP integration (createApp)", () => {
  let app: Application;

  beforeAll(async () => {
    const { createApp, setAppReadyForTests } = await import("../server");
    setAppReadyForTests(true);
    app = createApp();
  });

  afterAll(async () => {
    const { setAppReadyForTests } = await import("../server");
    setAppReadyForTests(false);
  });

  describe("Health endpoints", () => {
    it("GET /api/healthz returns 200 without auth", async () => {
      const res = await request(app).get("/api/healthz");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
    });

    it("GET /api/readyz returns ready when app is marked ready", async () => {
      const res = await request(app).get("/api/readyz");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
    });
  });

  describe("Auth", () => {
    it("rejects /api/products/analysis without x-api-key", async () => {
      const res = await request(app)
        .post("/api/products/analysis")
        .send({ filename: "sales-2025.xlsx" });
      expect(res.status).toBe(401);
    });

    // sessionAuth (legacy): błędny x-api-key → 401, nie 403 jak stary apiKeyAuth
    it("rejects /api/products/analysis with wrong x-api-key", async () => {
      const res = await request(app)
        .post("/api/products/analysis")
        .set("x-api-key", "wrong-key")
        .send({ filename: "sales-2025.xlsx" });
      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/uwierzytelnienie/i);
    });

    it("accepts /api/products/analysis with Bearer org context", async () => {
      const res = await request(app)
        .post("/api/products/analysis")
        .set(bearerHeaders())
        .send({ filename: "sales-2025.xlsx" });
      // 404 gdy brak rekordu UploadedFile; 400/500 przy innym błędzie odczytu
      expect([200, 400, 404, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("rejects /api/products/analysis with legacy x-api-key only (no org)", async () => {
      const res = await request(app)
        .post("/api/products/analysis")
        .set(authHeaders())
        .send({ filename: "sales-2025.xlsx" });
      expect(res.status).toBe(403);
    });
  });

  describe("CORS", () => {
    it("does not reflect disallowed Origin", async () => {
      const res = await request(app)
        .get("/api/healthz")
        .set("Origin", "http://evil.com");
      expect(res.headers["access-control-allow-origin"]).not.toBe(
        "http://evil.com"
      );
    });
  });

  describe("Admin and ops routes", () => {
    it("GET /api/admin/budget without auth → 401", async () => {
      const res = await request(app).get("/api/admin/budget");
      expect(res.status).toBe(401);
    });

    it("GET /api/admin/budget with MEMBER → 403", async () => {
      const res = await request(app)
        .get("/api/admin/budget")
        .set(bearerHeaders("MEMBER"));
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/uprawnień/i);
    });

    it("GET /api/admin/budget with OWNER → 200", async () => {
      const res = await request(app)
        .get("/api/admin/budget")
        .set(bearerHeaders("OWNER"));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("currentSpendUsd");
    });

    it("POST /api/ai/cache/clear with MEMBER → 403", async () => {
      const res = await request(app)
        .post("/api/ai/cache/clear")
        .set(bearerHeaders("MEMBER"));
      expect(res.status).toBe(403);
    });

    it("POST /api/ai/cache/clear with OWNER → 200", async () => {
      const res = await request(app)
        .post("/api/ai/cache/clear")
        .set(bearerHeaders("OWNER"));
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe("Rate limiting", () => {
    it("returns 429 after exceeding limit on /api/ai/*", async () => {
      const requests = Array.from({ length: 25 }, () =>
        request(app)
          .post("/api/ai/insights/run")
          .set(bearerHeaders())
          .send({ filename: "sales-2025.xlsx" })
      );
      const responses = await Promise.all(requests);
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });

  describe("Path traversal protection", () => {
    it("rejects ../.env in filename", async () => {
      const res = await request(app)
        .post("/api/products/analysis")
        .set(bearerHeaders())
        .send({ filename: "../.env" });
      expect(res.status).toBe(400);
    });

    it("rejects ../../etc/passwd", async () => {
      const res = await request(app)
        .post("/api/products/analysis")
        .set(bearerHeaders())
        .send({ filename: "../../etc/passwd" });
      expect(res.status).toBe(400);
    });
  });

  describe("Multer upload validation", () => {
    it("rejects upload without organization context (legacy x-api-key)", async () => {
      const res = await request(app)
        .post("/api/upload")
        .set(authHeaders())
        .attach("file", Buffer.from("x"), {
          filename: "data.xlsx",
          contentType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/organizacji/i);
    });

    // requireOrg wymaga Bearer z org — legacy x-api-key sam nie wystarczy
    it("rejects .exe upload", async () => {
      const res = await request(app)
        .post("/api/upload")
        .set(bearerHeaders())
        .attach("file", Buffer.from("malicious"), {
          filename: "evil.exe",
          contentType: "application/x-msdownload",
        });
      expect(res.status).toBe(400);
    });
  });

  describe("Error handler", () => {
    it("does not leak stack traces on 404", async () => {
      const res = await request(app)
        .get("/api/nonexistent-route")
        .set(authHeaders());
      expect(res.status).toBe(404);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain("at ");
      expect(body).not.toContain("node_modules");
    });
  });

  describe("Metrics token", () => {
    it("GET /metrics without token when METRICS_TOKEN is set → 401", async () => {
      const prev = process.env.METRICS_TOKEN;
      process.env.METRICS_TOKEN = "test-metrics-secret-token-32chars";
      vi.resetModules();
      const { createApp, setAppReadyForTests } = await import("../server");
      setAppReadyForTests(true);
      const metricsApp = createApp();

      const res = await request(metricsApp).get("/metrics");
      expect(res.status).toBe(401);

      process.env.METRICS_TOKEN = prev;
      vi.resetModules();
    });

    it("GET /metrics with valid Bearer when METRICS_TOKEN is set → 200", async () => {
      const prev = process.env.METRICS_TOKEN;
      process.env.METRICS_TOKEN = "test-metrics-secret-token-32chars";
      vi.resetModules();
      const { createApp, setAppReadyForTests } = await import("../server");
      setAppReadyForTests(true);
      const metricsApp = createApp();

      const res = await request(metricsApp)
        .get("/metrics")
        .set("Authorization", "Bearer test-metrics-secret-token-32chars");
      expect(res.status).toBe(200);
      expect(res.text).toMatch(/process_cpu/);

      process.env.METRICS_TOKEN = prev;
      vi.resetModules();
    });
  });
});
