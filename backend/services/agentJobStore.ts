import type { AiInsightsResponse } from "../shared/api-types";

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

const jobs = new Map<string, AgentJobRecord>();
const JOB_TTL_MS = 30 * 60 * 1000;

export function createJob(
  sessionId: string,
  filename: string,
  userInstructions?: string
): AgentJobRecord {
  pruneOldJobs();
  const job: AgentJobRecord = {
    sessionId,
    filename,
    userInstructions,
    status: "running",
    current_step: "Przygotowanie analizy…",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(sessionId, job);
  return job;
}

export function updateJobStep(sessionId: string, current_step: string): void {
  const job = jobs.get(sessionId);
  if (!job || job.status !== "running") return;
  job.current_step = current_step;
  job.updatedAt = Date.now();
}

export function completeJob(sessionId: string, result: AiInsightsResponse): void {
  pruneOldJobs();
  const job = jobs.get(sessionId);
  if (!job) return;
  job.status = "done";
  job.current_step = "Gotowe";
  job.result = result;
  job.updatedAt = Date.now();
}

export function failJob(sessionId: string, error: string): void {
  pruneOldJobs();
  const job = jobs.get(sessionId);
  if (!job) return;
  job.status = "error";
  job.current_step = "Błąd";
  job.error = error;
  job.updatedAt = Date.now();
}

export function getJob(sessionId: string): AgentJobRecord | null {
  pruneOldJobs();
  return jobs.get(sessionId) ?? null;
}

function pruneOldJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) jobs.delete(id);
  }
}
