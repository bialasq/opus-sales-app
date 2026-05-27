import type {
  AISuggestion,
  AnalystFactsPayload,
  ReActTraceStep,
} from "../shared/api-types";
import type { TokenUsage } from "./aiLogger";

/** Maks. rund ReAct (tool + odpowiedź) w jednej sesji */
export const MAX_ITERATIONS = Number(process.env.AGENT_MAX_ITERATIONS) || 5;

/** Limit tokenów na całą sesję agentową (Analityk + Strateg) */
export const SESSION_TOKEN_LIMIT =
  Number(process.env.AGENT_SESSION_TOKEN_LIMIT) || 28_000;

export type GuardrailStopReason =
  | "max_iterations"
  | "token_limit"
  | "budget_exceeded";

export function isTokenLimitExceeded(usage: TokenUsage): boolean {
  return usage.total_tokens >= SESSION_TOKEN_LIMIT;
}

export function isMaxIterationsReached(round: number): boolean {
  return round >= MAX_ITERATIONS - 1;
}

/** Liczba kroków z wywołaniem narzędzia w trace ReAct */
export function countToolSteps(trace: ReActTraceStep[]): number {
  return trace.filter((s) => Boolean(s.action?.trim())).length;
}

/** Przed kolejnym LLM — budżet rund narzędzi wyczerpany */
export function shouldStopForToolBudget(trace: ReActTraceStep[]): boolean {
  return countToolSteps(trace) >= MAX_ITERATIONS;
}

export const GUARDRAIL_MESSAGES: Record<GuardrailStopReason, string> = {
  max_iterations: `Osiągnięto limit ${MAX_ITERATIONS} iteracji ReAct — zwrócono częściowe wyniki.`,
  token_limit: `Osiągnięto limit ${SESSION_TOKEN_LIMIT} tokenów w sesji — zwrócono częściowe wyniki.`,
  budget_exceeded:
    "Dzienny budżet wywołań AI został wyczerpany — zwrócono częściowe wyniki. Spróbuj jutro lub zwiększ AI_BUDGET_USD_PER_DAY.",
};

export type PartialGuardrailMeta = {
  partial: true;
  partialReason: GuardrailStopReason;
  guardrailMessage: string;
};

export function buildPartialSuggestions(
  reactTrace: ReActTraceStep[],
  analystFacts: AnalystFactsPayload | null
): AISuggestion[] {
  const suggestions: AISuggestion[] = [];
  if (analystFacts?.anomalies?.length) {
    suggestions.push({
      title: "Anomalie wymagają reakcji (częściowa analiza)",
      description: analystFacts.anomalies.slice(0, 3).join(" · "),
      priority: "high",
    });
  }
  const lastTool = [...reactTrace].reverse().find((s) => s.action && s.action !== "final");
  if (lastTool?.observation) {
    suggestions.push({
      title: `Wynik ostatniego narzędzia: ${lastTool.action}`,
      description: String(lastTool.observation).slice(0, 400),
      priority: "medium",
    });
  }
  if (!suggestions.length) {
    suggestions.push({
      title: "Częściowa analiza",
      description:
        "Agent przerwał pracę z powodu limitów bezpieczeństwa. Odśwież analizę lub zmniejsz zakres danych.",
      priority: "medium",
    });
  }
  return suggestions;
}
