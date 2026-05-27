import type { Application } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function authHeaders(): { "x-api-key": string } {
  return { "x-api-key": process.env.API_KEY! };
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

    it("rejects /api/products/analysis with wrong x-api-key", async () => {
      const res = await request(app)
        .post("/api/products/analysis")
        .set("x-api-key", "wrong-key")
        .send({ filename: "sales-2025.xlsx" });
      expect(res.status).toBe(403);
    });

    it("accepts /api/products/analysis with correct x-api-key", async () => {
      const res = await request(app)
        .post("/api/products/analysis")
        .set(authHeaders())
        .send({ filename: "sales-2025.xlsx" });
      expect([200, 400, 500]).toContain(res.status);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
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

  describe("Rate limiting", () => {
    it("returns 429 after exceeding limit on /api/ai/*", async () => {
      const requests = Array.from({ length: 25 }, () =>
        request(app)
          .post("/api/ai/insights/run")
          .set(authHeaders())
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
        .set(authHeaders())
        .send({ filename: "../.env" });
      expect(res.status).toBe(400);
    });

    it("rejects ../../etc/passwd", async () => {
      const res = await request(app)
        .post("/api/products/analysis")
        .set(authHeaders())
        .send({ filename: "../../etc/passwd" });
      expect(res.status).toBe(400);
    });
  });

  describe("Multer upload validation", () => {
    it("rejects .exe upload", async () => {
      const res = await request(app)
        .post("/api/upload")
        .set(authHeaders())
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
});
