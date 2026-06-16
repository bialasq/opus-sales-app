import type {
  AISuggestion,
  AnalystFactsPayload,
  JudgeReviewItem,
  JudgeReviewResult,
} from "../shared/api-types";
import { createLogger } from "./appLogger";
import { chooseProvider, invokeLlmJsonObject } from "./llmInvoke";

const log = createLogger("judgeService");

const JUDGE_SYSTEM = `Jesteś niezależnym sędzią jakości (LLM-as-a-Judge) dla sugestii sprzedażowych B2B.
Otrzymujesz fakty od Analityka oraz listę sugestii Stratega.
Dla KAŻDEJ sugestii oceń:
1) consistency — czy nie przeczy faktom? (pass | warn | fail)
2) risk — czy rekomendacja nie jest zbyt agresywna? (low | medium | high)

Zwróć WYŁĄCZNIE JSON:
{
  "items": [
    {
      "index": 0,
      "consistency": "pass"|"warn"|"fail",
      "risk": "low"|"medium"|"high",
      "consistencyNote": "krótko po polsku",
      "riskNote": "krótko po polsku",
      "approved": true|false
    }
  ],
  "overall_pass": true|false
}

approved=true tylko gdy consistency nie jest "fail" i risk nie jest "high".`;

function getJudgeModel(): string {
  return process.env.AI_JUDGE_MODEL || "gpt-4o-mini";
}

function normalizeJudgeItems(
  raw: unknown,
  suggestions: AISuggestion[]
): JudgeReviewItem[] {
  const list = Array.isArray((raw as { items?: unknown })?.items)
    ? ((raw as { items: unknown[] }).items as Record<string, unknown>[])
    : [];

  return suggestions.map((s, index) => {
    const row =
      list.find((r) => Number(r.index) === index) ??
      list[index] ??
      ({} as Record<string, unknown>);

    const consistency = ["pass", "warn", "fail"].includes(String(row.consistency))
      ? (String(row.consistency) as JudgeReviewItem["consistency"])
      : "warn";

    const risk = ["low", "medium", "high"].includes(String(row.risk))
      ? (String(row.risk) as JudgeReviewItem["risk"])
      : "medium";

    const approved =
      typeof row.approved === "boolean"
        ? row.approved
        : consistency !== "fail" && risk !== "high";

    return {
      index,
      title: s.title,
      consistency,
      risk,
      consistencyNote: String(row.consistencyNote ?? "").slice(0, 280) || "Brak uzasadnienia sędziego",
      riskNote: String(row.riskNote ?? "").slice(0, 280) || "Brak oceny ryzyka",
      approved,
    };
  });
}

/**
 * Automatyczna bramka jakości — mały model ocenia spójność i ryzyko sugestii.
 */
export async function runJudgeReview(
  facts: AnalystFactsPayload,
  suggestions: AISuggestion[]
): Promise<JudgeReviewResult | null> {
  if (!suggestions.length) return null;
  if (chooseProvider() === "none") return null;

  const judgeModel = getJudgeModel();
  const user = JSON.stringify({
    analystFacts: facts,
    suggestions: suggestions.map((s, i) => ({
      index: i,
      title: s.title,
      description: s.description,
      priority: s.priority,
    })),
  });

  try {
    const { raw, model, usage } = await invokeLlmJsonObject({
      system: JUDGE_SYSTEM,
      user,
      temperature: 0.1,
      modelOverride: judgeModel,
      maxTokensOpenAi: 2048,
      maxTokensAnthropic: 2048,
    });

    const parsed = JSON.parse(raw) as { items?: unknown; overall_pass?: boolean };
    const items = normalizeJudgeItems(parsed, suggestions);
    const overall_pass =
      typeof parsed.overall_pass === "boolean"
        ? parsed.overall_pass
        : items.every((i) => i.approved);

    return {
      model: model || judgeModel,
      reviewedAt: new Date().toISOString(),
      overall_pass,
      items,
      tokens_used: usage.total_tokens,
    };
  } catch (e) {
    log.warn("Judge review skipped", e);
    return null;
  }
}
