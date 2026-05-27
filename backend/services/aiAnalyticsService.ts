import fs from "fs";
import path from "path";
import { clearAllAgentCache, getCacheStats } from "./agentCache";
import { loadAllFeedback, buildSessionFilenameIndex } from "./knowledgeService";

const TRACES_DIR = path.join(__dirname, "..", "logs", "traces");

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

function readTraceFiles(): Array<{
  timestamp: string;
  filename?: string;
  cost_usd: number;
  latency_ms: number;
  total_tokens: number;
  from_cache?: boolean;
  eval_hallucinations?: number;
}> {
  if (!fs.existsSync(TRACES_DIR)) return [];
  const out: ReturnType<typeof readTraceFiles> = [];

  for (const file of fs.readdirSync(TRACES_DIR)) {
    if (!file.endsWith(".json") || file.includes("feedback")) continue;
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(TRACES_DIR, file), "utf8")
      ) as {
        timestamp?: string;
        filename?: string;
        cost_usd?: number;
        latency_ms?: number;
        total_tokens?: number;
        meta?: { from_cache?: boolean; cache_hit?: boolean };
        eval_summary?: { potential_hallucination?: number };
      };
      out.push({
        timestamp: data.timestamp || file,
        filename: data.filename,
        cost_usd: data.cost_usd ?? 0,
        latency_ms: data.latency_ms ?? 0,
        total_tokens: data.total_tokens ?? 0,
        from_cache: Boolean(data.meta?.from_cache || data.meta?.cache_hit),
        eval_hallucinations: data.eval_summary?.potential_hallucination ?? 0,
      });
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function getAiPerformanceStats(): Promise<AiPerformanceStats> {
  const traces = readTraceFiles();
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

  const feedback = loadAllFeedback(buildSessionFilenameIndex());
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
