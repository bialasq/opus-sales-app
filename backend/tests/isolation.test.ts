/**
 * Dowód izolacji multi-tenant: organizacja B nie może odczytać pliku organizacji A.
 * Wymaga działającej bazy PostgreSQL (DATABASE_URL w backend/.env).
 */
import type { Application } from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import * as XLSX from "xlsx";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

function buildMinimalTestXlsx(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([
    {
      Nazwa_Produktu: "Widget Izolacji",
      Wartość: 150,
      Kategoria: "Test",
      Ilość: 3,
    },
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Sprzedaż");
  return Buffer.from(
    XLSX.write(wb, { type: "buffer", bookType: "xlsx" })
  );
}

type OrgSession = {
  token: string;
  organizationId: string;
  userId: string;
  email: string;
};

async function registerAndLogin(
  app: Application,
  organizationName: string,
  email: string,
  password: string
): Promise<OrgSession> {
  const registerRes = await request(app)
    .post("/api/auth/register")
    .send({ organizationName, email, password, userName: "Test User" });
  expect(registerRes.status).toBe(201);

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.accessToken).toBeTruthy();

  return {
    token: loginRes.body.accessToken as string,
    organizationId: registerRes.body.organizationId as string,
    userId: registerRes.body.userId as string,
    email,
  };
}

describe("Multi-tenant isolation (integration)", () => {
  let app: Application;
  let orgA: OrgSession;
  let orgB: OrgSession;
  let storageKey: string;
  /** false gdy brak DATABASE_URL lub PostgreSQL niedostępny — testy są pomijane */
  let suiteReady = false;

  const runId = Date.now();
  const password = "IsolationTest1!";
  const emailA = `isolation-a-${runId}@opus-test.local`;
  const emailB = `isolation-b-${runId}@opus-test.local`;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      console.warn(
        "[isolation] Pominięto — brak DATABASE_URL (ustaw w backend/.env)"
      );
      return;
    }

    const { prisma } = await import("../services/prisma");
    try {
      await prisma.$connect();
    } catch {
      console.warn(
        "[isolation] Pominięto — nie można połączyć z PostgreSQL (DATABASE_URL)"
      );
      return;
    }

    const { createApp, setAppReadyForTests } = await import("../server");
    setAppReadyForTests(true);
    app = createApp();

    orgA = await registerAndLogin(
      app,
      `Isolation Org A ${runId}`,
      emailA,
      password
    );
    orgB = await registerAndLogin(
      app,
      `Isolation Org B ${runId}`,
      emailB,
      password
    );

    const xlsx = buildMinimalTestXlsx();
    const uploadRes = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${orgA.token}`)
      .attach("file", xlsx, {
        filename: "isolation-test.xlsx",
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.filename).toBeTruthy();
    storageKey = uploadRes.body.filename as string;
    suiteReady = true;
  }, 60_000);

  afterAll(async () => {
    if (!suiteReady) return;

    const { prisma } = await import("../services/prisma");
    const { orgStorage } = await import("../services/orgStorage");

    if (storageKey && orgA?.organizationId) {
      try {
        await orgStorage(orgA.organizationId).deleteFile(storageKey);
      } catch {
        /* plik mógł już zostać usunięty kaskadowo */
      }
    }

    const orgIds = [orgA?.organizationId, orgB?.organizationId].filter(Boolean);
    for (const id of orgIds) {
      try {
        await prisma.organization.delete({ where: { id } });
      } catch {
        /* organizacja mogła zostać już usunięta */
      }
    }

    await prisma.$disconnect();
  }, 30_000);

  it("org A odczytuje własny plik (products/analysis) — nie 404", async (ctx) => {
    if (!suiteReady) ctx.skip();
    const res = await request(app)
      .post("/api/products/analysis")
      .set("Authorization", `Bearer ${orgA.token}`)
      .send({ filename: storageKey });

    expect(res.status).not.toBe(404);
    expect([200, 400, 500]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.products).toBeDefined();
    }
  });

  it("org B nie może odczytać pliku org A (products/analysis) → 404", async (ctx) => {
    if (!suiteReady) ctx.skip();
    const res = await request(app)
      .post("/api/products/analysis")
      .set("Authorization", `Bearer ${orgB.token}`)
      .send({ filename: storageKey });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/nie istnieje/i);
  });

  it("org B nie może odczytać pliku org A (analytics/dashboard) → 404", async (ctx) => {
    if (!suiteReady) ctx.skip();
    const res = await request(app)
      .post("/api/analytics/dashboard")
      .set("Authorization", `Bearer ${orgB.token}`)
      .send({ filename: storageKey });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/nie istnieje/i);
  });

  it("org B nie może odczytać pliku org A (GET /api/ai/insights) → 404", async (ctx) => {
    if (!suiteReady) ctx.skip();
    const res = await request(app)
      .get("/api/ai/insights")
      .set("Authorization", `Bearer ${orgB.token}`)
      .query({ filename: storageKey });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/nie istnieje/i);
  });

  it("żądanie bez uwierzytelnienia → 401 lub 403", async (ctx) => {
    if (!suiteReady) ctx.skip();
    const res = await request(app)
      .post("/api/products/analysis")
      .send({ filename: storageKey });

    expect([401, 403]).toContain(res.status);
  });
});
