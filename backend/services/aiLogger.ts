import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ReActTraceStep } from "../shared/api-types";
import { getActivePromptVersion } from "../prompts";
import type { SuggestionFeedbackBody } from "../shared/api-types";
import { createLogger } from "./appLogger";
import { scrubObject } from "../utils/piiScrubber";

const log = createLogger("aiLogger");

const TRACES_DIR = path.join(__dirname, "..", "logs", "traces");

/** Ceny USD za 1M tokenów (input / output) — szacunek do optymalizacji kosztów */
const MODEL_PRICING_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "claude-3-5-haiku-20241022": { input: 0.25, output: 1.25 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-sonnet-latest": { input: 3, output: 15 },
};

const DEFAULT_PRICING = { input: 1, output: 3 };

export type TokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type AgentTraceLogEntry = {
  timestamp: string;
  sessionID: string;
  workflow: string;
  prompt_version: string;
  filename?: string;
  models?: { analyst?: string; strategist?: string };
  full_trace: ReActTraceStep[];
  analyst_facts?: unknown;
  suggestions_count?: number;
  total_tokens: number;
  cost_usd: number;
  latency_ms: number;
  eval_summary?: { verified: number; potential_hallucination: number };
  meta?: Record<string, unknown>;
};

export function createSessionId(): string {
  return randomUUID();
}

export function emptyUsage(): TokenUsage {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
}

export function mergeUsage(a: TokenUsage, b: Partial<TokenUsage>): TokenUsage {
  const prompt = a.prompt_tokens + (b.prompt_tokens ?? 0);
  const completion = a.completion_tokens + (b.completion_tokens ?? 0);
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  };
}

export function usageFromOpenAI(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): Partial<TokenUsage> {
  if (!usage) return {};
  return {
    prompt_tokens: usage.prompt_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    total_tokens:
      usage.total_tokens ??
      (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
  };
}

export function usageFromAnthropic(usage?: {
  input_tokens?: number;
  output_tokens?: number;
}): Partial<TokenUsage> {
  if (!usage) return {};
  const prompt = usage.input_tokens ?? 0;
  const completion = usage.output_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
  };
}

/**
 * Szacunkowy koszt USD na podstawie modelu i tokenów (do dashboardów / optymalizacji).
 */
export function estimateCostUsd(model: string, usage: TokenUsage): number {
  const m = model.toLowerCase();
  let pricing = DEFAULT_PRICING;
  if (m.includes("gpt-4o-mini")) pricing = MODEL_PRICING_PER_1M["gpt-4o-mini"];
  else if (m.includes("gpt-4o")) pricing = MODEL_PRICING_PER_1M["gpt-4o"];
  else if (m.includes("haiku")) pricing = MODEL_PRICING_PER_1M["claude-3-5-haiku-20241022"];
  else if (m.includes("sonnet")) pricing = MODEL_PRICING_PER_1M["claude-3-5-sonnet-20241022"];
  else if (MODEL_PRICING_PER_1M[model]) pricing = MODEL_PRICING_PER_1M[model];

  const inputCost = (usage.prompt_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.completion_tokens / 1_000_000) * pricing.output;
  return Number((inputCost + outputCost).toFixed(6));
}

export function estimateWorkflowCostUsd(models: string[], usage: TokenUsage): number {
  const model = models.find(Boolean) || "unknown";
  return estimateCostUsd(model, usage);
}

async function ensureTracesDir(): Promise<void> {
  await fs.promises.mkdir(TRACES_DIR, { recursive: true });
}

function logWriteError(label: string, err: unknown): void {
  log.error(label, err);
}

/**
 * Zapisuje pełny trace agenta do backend/logs/traces/*.json (async, nie blokuje event loop).
 */
export async function logAgentTrace(
  entry: Omit<AgentTraceLogEntry, "timestamp" | "prompt_version">
): Promise<string> {
  await ensureTracesDir();
  const timestamp = new Date().toISOString();
  const full: AgentTraceLogEntry = scrubObject({
    ...entry,
    timestamp,
    prompt_version: getActivePromptVersion(),
  });
  const safeSession = entry.sessionID.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
  const fileTs = timestamp.replace(/[:.]/g, "-");
  const filePath = path.join(TRACES_DIR, `${fileTs}_${safeSession}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(full, null, 2), "utf8");
  return filePath;
}

/** RLHF — feedback użytkownika do pliku traces (JSONL), append async */
export async function logSuggestionFeedback(
  feedback: SuggestionFeedbackBody & { timestamp?: string; filename?: string }
): Promise<string> {
  await ensureTracesDir();
  const line = JSON.stringify(
    scrubObject({
      ...feedback,
      timestamp: feedback.timestamp ?? new Date().toISOString(),
      prompt_version: getActivePromptVersion(),
    })
  );
  const safeSession = feedback.sessionId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);
  const filePath = path.join(TRACES_DIR, `${safeSession}-feedback.jsonl`);
  await fs.promises.appendFile(filePath, `${line}\n`, "utf8");
  return filePath;
}

/** Fire-and-forget — dla ścieżek HTTP bez await */
export function logAgentTraceAsync(
  entry: Omit<AgentTraceLogEntry, "timestamp" | "prompt_version">
): void {
  void logAgentTrace(entry).catch((e) => logWriteError("logAgentTrace", e));
}

export function logSuggestionFeedbackAsync(
  feedback: SuggestionFeedbackBody & { timestamp?: string; filename?: string }
): void {
  void logSuggestionFeedback(feedback).catch((e) => logWriteError("logSuggestionFeedback", e));
}
