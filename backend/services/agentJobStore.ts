import type { JobStatus, Prisma } from "@prisma/client";
import type { AiInsightsResponse } from "../shared/api-types";
import { createLogger } from "./appLogger";
import { prisma } from "./prisma";
import { getRedis } from "./redis";

const log = createLogger("agentJobStore");

export type AgentJobStatus = "running" | "done" | "error";

export type AgentJobRecord = {
  sessionId: string;
  filename: string;
  organizationId: string;
  createdById: string;
  fileId: string;
  userInstructions?: string;
  status: AgentJobStatus;
  current_step: string;
  result?: AiInsightsResponse;
  error?: string;
  startedAt: number;
  updatedAt: number;
};

const JOB_TTL_SECONDS = 30 * 60;
const JOB_TTL_MS = JOB_TTL_SECONDS * 1000;
const MAX_MEMORY_JOBS = 10_000;
const MEMORY_FALLBACK = new Map<string, AgentJobRecord>();

function jobKey(sessionId: string): string {
  return `agentjob:${sessionId}`;
}

function toDbStatus(status: AgentJobStatus): JobStatus {
  switch (status) {
    case "running":
      return "RUNNING";
    case "done":
      return "DONE";
    case "error":
      return "FAILED";
  }
}

function fromDbStatus(status: JobStatus): AgentJobStatus {
  switch (status) {
    case "PENDING":
    case "RUNNING":
      return "running";
    case "DONE":
      return "done";
    case "FAILED":
      return "error";
  }
}

type DbJobRow = {
  sessionId: string;
  organizationId: string;
  createdById: string;
  fileId: string;
  status: JobStatus;
  currentStep: string | null;
  result: Prisma.JsonValue | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  file: { storageKey: string };
};

function mapDbRowToRecord(row: DbJobRow): AgentJobRecord {
  return {
    sessionId: row.sessionId,
    filename: row.file.storageKey,
    organizationId: row.organizationId,
    createdById: row.createdById,
    fileId: row.fileId,
    status: fromDbStatus(row.status),
    current_step: row.currentStep ?? "",
    result: row.result
      ? (row.result as unknown as AiInsightsResponse)
      : undefined,
    error: row.errorMessage ?? undefined,
    startedAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function pruneMemoryFallback(): void {
  const now = Date.now();
  for (const [id, job] of MEMORY_FALLBACK.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) MEMORY_FALLBACK.delete(id);
  }
  while (MEMORY_FALLBACK.size >= MAX_MEMORY_JOBS) {
    const firstKey = MEMORY_FALLBACK.keys().next().value;
    if (!firstKey) break;
    MEMORY_FALLBACK.delete(firstKey);
  }
}

async function persistJob(job: AgentJobRecord): Promise<void> {
  try {
    const redis = getRedis();
    if (redis) {
      await redis.set(
        jobKey(job.sessionId),
        JSON.stringify(job),
        "EX",
        JOB_TTL_SECONDS
      );
      return;
    }
    pruneMemoryFallback();
    MEMORY_FALLBACK.set(job.sessionId, job);
  } catch (err) {
    log.warn("persistJob: cache niedostępny, pomijam", {
      sessionId: job.sessionId,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

async function createJobInDb(job: AgentJobRecord): Promise<void> {
  try {
    await prisma.analysisJob.create({
      data: {
        sessionId: job.sessionId,
        organizationId: job.organizationId,
        createdById: job.createdById,
        fileId: job.fileId,
        status: toDbStatus(job.status),
        currentStep: job.current_step,
      },
    });
  } catch (err) {
    log.error("createJob: zapis do bazy nie powiódł się, kontynuuję z cache", {
      sessionId: job.sessionId,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

async function updateJobInDb(
  sessionId: string,
  data: {
    status?: JobStatus;
    currentStep?: string;
    result?: Prisma.InputJsonValue;
    errorMessage?: string;
  },
  mustPersist: boolean
): Promise<void> {
  const run = () =>
    prisma.analysisJob.update({
      where: { sessionId },
      data,
    });

  try {
    await run();
  } catch (err) {
    log.error("updateJobInDb: zapis do bazy nie powiódł się", {
      sessionId,
      detail: err instanceof Error ? err.message : String(err),
    });
    if (!mustPersist) return;
    try {
      await run();
    } catch (retryErr) {
      log.error("updateJobInDb: ponowienie zapisu nie powiodło się", {
        sessionId,
        detail: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
    }
  }
}

async function getJobFromCache(sessionId: string): Promise<AgentJobRecord | null> {
  try {
    const redis = getRedis();
    if (redis) {
      const raw = await redis.get(jobKey(sessionId));
      if (!raw) return null;
      try {
        return JSON.parse(raw) as AgentJobRecord;
      } catch {
        log.warn(`Corrupt job record for ${sessionId}`);
        return null;
      }
    }
    pruneMemoryFallback();
    return MEMORY_FALLBACK.get(sessionId) ?? null;
  } catch (err) {
    log.warn("getJobFromCache failed", {
      sessionId,
      detail: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function getJobFromDb(sessionId: string): Promise<AgentJobRecord | null> {
  try {
    const row = await prisma.analysisJob.findUnique({
      where: { sessionId },
      include: { file: { select: { storageKey: true } } },
    });
    if (!row) return null;
    return mapDbRowToRecord(row);
  } catch (err) {
    log.warn("getJobFromDb failed", {
      sessionId,
      detail: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function createJob(
  sessionId: string,
  filename: string,
  userInstructions: string | undefined,
  organizationId: string,
  createdById: string,
  fileId: string
): Promise<AgentJobRecord> {
  const job: AgentJobRecord = {
    sessionId,
    filename,
    organizationId,
    createdById,
    fileId,
    userInstructions,
    status: "running",
    current_step: "Przygotowanie analizy…",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await persistJob(job);
  await createJobInDb(job);
  return job;
}

export async function updateJobStep(
  sessionId: string,
  current_step: string
): Promise<void> {
  const job = await getJob(sessionId);
  if (!job || job.status !== "running") return;
  job.current_step = current_step;
  job.updatedAt = Date.now();
  await persistJob(job);
  await updateJobInDb(sessionId, { currentStep: current_step }, false);
}

export async function completeJob(
  sessionId: string,
  result: AiInsightsResponse
): Promise<void> {
  const job = await getJob(sessionId);
  if (!job) return;
  job.status = "done";
  job.current_step = "Gotowe";
  job.result = result;
  job.updatedAt = Date.now();
  await persistJob(job);
  await updateJobInDb(
    sessionId,
    {
      status: "DONE",
      currentStep: job.current_step,
      result: result as unknown as Prisma.InputJsonValue,
    },
    true
  );
}

export async function failJob(sessionId: string, error: string): Promise<void> {
  const job = await getJob(sessionId);
  if (!job) return;
  job.status = "error";
  job.current_step = "Błąd";
  job.error = error;
  job.updatedAt = Date.now();
  await persistJob(job);
  await updateJobInDb(
    sessionId,
    {
      status: "FAILED",
      currentStep: job.current_step,
      errorMessage: error,
    },
    true
  );
}

export async function getJob(sessionId: string): Promise<AgentJobRecord | null> {
  const cached = await getJobFromCache(sessionId);
  if (cached) return cached;

  const fromDb = await getJobFromDb(sessionId);
  if (!fromDb) return null;

  void persistJob(fromDb);
  return fromDb;
}

export async function deleteJob(sessionId: string): Promise<void> {
  try {
    const redis = getRedis();
    if (redis) {
      await redis.del(jobKey(sessionId));
      return;
    }
    MEMORY_FALLBACK.delete(sessionId);
  } catch (err) {
    log.warn("deleteJob: cache cleanup failed", {
      sessionId,
      detail: err instanceof Error ? err.message : String(err),
    });
    MEMORY_FALLBACK.delete(sessionId);
  }
}

if (!getRedis()) {
  setInterval(() => pruneMemoryFallback(), 60_000).unref();
}

/** Tylko testy — wyczyść pamięć. */
export function __clearMemoryJobsForTests(): void {
  MEMORY_FALLBACK.clear();
}
