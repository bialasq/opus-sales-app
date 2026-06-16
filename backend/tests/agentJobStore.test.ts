import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import {
  __clearMemoryJobsForTests,
  createJob,
  deleteJob,
  getJob,
} from "../services/agentJobStore";
import { __resetRedisClientForTests } from "../services/redis";

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

describe("agentJobStore (memory fallback)", () => {
  const jobContext = {
    organizationId: "org-test-1",
    createdById: "user-test-1",
    fileId: "file-test-1",
  };

  beforeEach(() => {
    vi.stubEnv("REDIS_URL", "");
    __resetRedisClientForTests();
    __clearMemoryJobsForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __clearMemoryJobsForTests();
  });

  it("setJob + getJob round-trip", async () => {
    await createJob(
      "sess-1",
      "sales-2025.xlsx",
      "focus Q4",
      jobContext.organizationId,
      jobContext.createdById,
      jobContext.fileId
    );
    const job = await getJob("sess-1");
    expect(job).not.toBeNull();
    expect(job?.sessionId).toBe("sess-1");
    expect(job?.filename).toBe("sales-2025.xlsx");
    expect(job?.organizationId).toBe(jobContext.organizationId);
    expect(job?.createdById).toBe(jobContext.createdById);
    expect(job?.fileId).toBe(jobContext.fileId);
    expect(job?.status).toBe("running");
  });

  it("getJob returns null for missing", async () => {
    expect(await getJob("missing-id")).toBeNull();
  });

  it("deleteJob removes record", async () => {
    await createJob(
      "sess-del",
      "data.xlsx",
      undefined,
      jobContext.organizationId,
      jobContext.createdById,
      jobContext.fileId
    );
    await deleteJob("sess-del");
    expect(await getJob("sess-del")).toBeNull();
  });
});

describe("agentJobStore (database source of truth)", () => {
  let suiteReady = false;
  let organizationId = "";
  let userId = "";
  let fileId = "";
  let sessionId = "";
  const runId = Date.now();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.trim()) {
      console.warn("[agentJobStore.db] Pominięto — brak DATABASE_URL");
      return;
    }

    const { prisma } = await import("../services/prisma");
    try {
      await prisma.$connect();
    } catch {
      console.warn("[agentJobStore.db] Pominięto — PostgreSQL niedostępny");
      return;
    }

    const org = await prisma.organization.create({
      data: { name: `JobStore Test Org ${runId}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `jobstore-${runId}@opus-test.local`,
        passwordHash: "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv",
        organizationId: org.id,
        role: "OWNER",
      },
    });
    const file = await prisma.uploadedFile.create({
      data: {
        organizationId: org.id,
        uploadedById: user.id,
        storageKey: `jobstore-${runId}.xlsx`,
        originalName: "jobstore-test.xlsx",
        sizeBytes: 128,
      },
    });

    organizationId = org.id;
    userId = user.id;
    fileId = file.id;
    sessionId = randomUUID();
    suiteReady = true;
  }, 30_000);

  afterAll(async () => {
    if (!suiteReady) return;

    const { prisma } = await import("../services/prisma");
    try {
      if (sessionId) {
        await prisma.analysisJob.deleteMany({ where: { sessionId } });
      }
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } });
      }
    } catch {
      /* best-effort cleanup */
    }
    await prisma.$disconnect();
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("REDIS_URL", "");
    __resetRedisClientForTests();
    __clearMemoryJobsForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __clearMemoryJobsForTests();
  });

  it("getJob odtwarza job z bazy po wyczyszczeniu cache", async (ctx) => {
    if (!suiteReady) ctx.skip();

    await createJob(
      sessionId,
      `jobstore-${runId}.xlsx`,
      undefined,
      organizationId,
      userId,
      fileId
    );

    await deleteJob(sessionId);
    __clearMemoryJobsForTests();

    const restored = await getJob(sessionId);
    expect(restored).not.toBeNull();
    expect(restored?.sessionId).toBe(sessionId);
    expect(restored?.organizationId).toBe(organizationId);
    expect(restored?.createdById).toBe(userId);
    expect(restored?.fileId).toBe(fileId);
    expect(restored?.status).toBe("running");
    expect(restored?.current_step).toMatch(/Przygotowanie analizy/);
  });
});
