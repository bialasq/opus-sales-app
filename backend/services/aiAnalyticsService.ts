import { clearAllAgentCache, getCacheStats } from "./agentCache";
import {
  buildSessionFilenameIndex,
  loadAllFeedback,
} from "./knowledgeService";
import { readTraceJsonSummaries } from "./traceLogReader";

export type AiPerformanceStats = {
  totalRuns: number;
  avgCostUsd: number;
  avgLatencyMs: number;
  totalTokens: number;
  approvalRatePercent: number | null;
  totalFeedback: number;
  approvedCount: number;
  rejectedCount: number;
  hallucinationCount: number;
  hallucinationRatePercent: number | null;
  cacheEntries: number;
  recentRuns: {
    timestamp: string;
    filename?: string;
    cost_usd: number;
    latency_ms: number;
    from_cache?: boolean;
  }[];
};

export async function getAiPerformanceStats(): Promise<AiPerformanceStats> {
  const traces = await readTraceJsonSummaries();
  const nonCacheRuns = traces.filter((t) => !t.from_cache);
  const runsForAvg = nonCacheRuns.length > 0 ? nonCacheRuns : traces;

  const totalRuns = traces.length;
  const avgCostUsd =
    runsForAvg.length > 0
      ? runsForAvg.reduce((s, t) => s + t.cost_usd, 0) / runsForAvg.length
      : 0;
  const avgLatencyMs =
    runsForAvg.length > 0
      ? runsForAvg.reduce((s, t) => s + t.latency_ms, 0) / runsForAvg.length
      : 0;
  const totalTokens = traces.reduce((s, t) => s + t.total_tokens, 0);
  const hallucinationCount = traces.reduce(
    (s, t) => s + (t.eval_hallucinations ?? 0),
    0
  );

  const sessionIndex = await buildSessionFilenameIndex();
  const feedback = await loadAllFeedback(sessionIndex);
  const approvedCount = feedback.filter((f) => f.verdict === "approve").length;
  const rejectedCount = feedback.filter((f) => f.verdict === "reject").length;
  const totalFeedback = approvedCount + rejectedCount;
  const approvalRatePercent =
    totalFeedback > 0
      ? Number(((approvedCount / totalFeedback) * 100).toFixed(1))
      : null;
  const hallucinationRatePercent =
    totalRuns > 0
      ? Number(((hallucinationCount / totalRuns) * 100).toFixed(1))
      : null;

  const cacheStats = await getCacheStats();

  return {
    totalRuns,
    avgCostUsd: Number(avgCostUsd.toFixed(6)),
    avgLatencyMs: Math.round(avgLatencyMs),
    totalTokens,
    approvalRatePercent,
    totalFeedback,
    approvedCount,
    rejectedCount,
    hallucinationCount,
    hallucinationRatePercent,
    cacheEntries: cacheStats.size,
    recentRuns: traces.slice(0, 10).map((t) => ({
      timestamp: t.timestamp,
      filename: t.filename,
      cost_usd: t.cost_usd,
      latency_ms: t.latency_ms,
      from_cache: t.from_cache,
    })),
  };
}

export async function clearAiCache(): Promise<{ cleared: number }> {
  return clearAllAgentCache();
}
