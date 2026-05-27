import type { AiInsightsResponse } from "../shared/api-types";
import { createLogger } from "./appLogger";
import { getRedis } from "./redis";

const log = createLogger("agentJobStore");

export type AgentJobStatus = "running" | "done" | "error";

export type AgentJobRecord = {
  sessionId: string;
  filename: string;
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
  const redis = getRedis();
  if (redis) {
    await redis.set(jobKey(job.sessionId), JSON.stringify(job), "EX", JOB_TTL_SECONDS);
    return;
  }
  pruneMemoryFallback();
  MEMORY_FALLBACK.set(job.sessionId, job);
}

export async function createJob(
  sessionId: string,
  filename: string,
  userInstructions?: string
): Promise<AgentJobRecord> {
  const job: AgentJobRecord = {
    sessionId,
    filename,
    userInstructions,
    status: "running",
    current_step: "Przygotowanie analizy…",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await persistJob(job);
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
}

export async function failJob(sessionId: string, error: string): Promise<void> {
  const job = await getJob(sessionId);
  if (!job) return;
  job.status = "error";
  job.current_step = "Błąd";
  job.error = error;
  job.updatedAt = Date.now();
  await persistJob(job);
}

export async function getJob(sessionId: string): Promise<AgentJobRecord | null> {
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
}

export async function deleteJob(sessionId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    await redis.del(jobKey(sessionId));
    return;
  }
  MEMORY_FALLBACK.delete(sessionId);
}

if (!getRedis()) {
  setInterval(() => pruneMemoryFallback(), 60_000).unref();
}

/** Tylko testy — wyczyść pamięć. */
export function __clearMemoryJobsForTests(): void {
  MEMORY_FALLBACK.clear();
}
