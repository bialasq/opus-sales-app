import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StoredMapping } from "../shared/api-types";
import { getMapping, saveMapping } from "../services/mappingCache";

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

describe("mappingCache (database)", () => {
  let suiteReady = false;
  let organizationId = "";
  const fingerprint = "abc123fingerprint";
  const runId = Date.now();

  const sampleMapping: StoredMapping = {
    sheetRoles: { Sprzedaż: "sales", Wizyty: "ignore" },
    columns: {
      Sprzedaż: {
        productName: "Produkt",
        revenue: "Wartość",
        quantity: null,
      },
    },
    createdAt: new Date().toISOString(),
    source: "agent",
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      console.warn("[mappingCache] Pominięto — brak DATABASE_URL");
      return;
    }

    const { prisma } = await import("../services/prisma");
    try {
      await prisma.$connect();
    } catch {
      console.warn("[mappingCache] Pominięto — PostgreSQL niedostępny");
      return;
    }

    const org = await prisma.organization.create({
      data: {
        name: `MappingCache Test Org ${runId}`,
        settings: {
          baseCity: "Olsztyn",
          currency: "PLN",
        },
      },
    });
    organizationId = org.id;
    suiteReady = true;
  }, 30_000);

  afterAll(async () => {
    if (!suiteReady) return;

    const { prisma } = await import("../services/prisma");
    try {
      await prisma.organization.delete({ where: { id: organizationId } });
    } catch {
      /* best-effort */
    }
    await prisma.$disconnect();
  }, 30_000);

  it("saveMapping potem getMapping zwraca to samo mapowanie", async (ctx) => {
    if (!suiteReady) ctx.skip();

    await saveMapping(organizationId, fingerprint, sampleMapping);
    const loaded = await getMapping(organizationId, fingerprint);

    expect(loaded).toEqual(sampleMapping);
  });

  it("saveMapping nie nadpisuje innych pól settings", async (ctx) => {
    if (!suiteReady) ctx.skip();

    const { prisma } = await import("../services/prisma");
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { settings: true },
    });

    const settings = org?.settings as Record<string, unknown>;
    expect(settings.baseCity).toBe("Olsztyn");
    expect(settings.currency).toBe("PLN");
    expect(settings.columnMappings).toBeDefined();
  });

  it("getMapping zwraca null dla nieznanego fingerprintu", async (ctx) => {
    if (!suiteReady) ctx.skip();

    const loaded = await getMapping(organizationId, "nieistniejacy-odcisk");
    expect(loaded).toBeNull();
  });
});
