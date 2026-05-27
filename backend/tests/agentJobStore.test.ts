import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __clearMemoryJobsForTests,
  createJob,
  deleteJob,
  getJob,
} from "../services/agentJobStore";
import { __resetRedisClientForTests } from "../services/redis";

describe("agentJobStore (memory fallback)", () => {
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
    await createJob("sess-1", "sales-2025.xlsx", "focus Q4");
    const job = await getJob("sess-1");
    expect(job).not.toBeNull();
    expect(job?.sessionId).toBe("sess-1");
    expect(job?.filename).toBe("sales-2025.xlsx");
    expect(job?.status).toBe("running");
  });

  it("getJob returns null for missing", async () => {
    expect(await getJob("missing-id")).toBeNull();
  });

  it("deleteJob removes record", async () => {
    await createJob("sess-del", "data.xlsx");
    await deleteJob("sess-del");
    expect(await getJob("sess-del")).toBeNull();
  });
});
