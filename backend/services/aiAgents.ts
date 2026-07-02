import { SalesWorkbookContext } from "./aiAgentTools";
import { runAgentToolInsightLoop } from "./agentOrchestrator";
import {
  AGENT_INSIGHT_JSON_HINT,
  AGENT_INSIGHT_TOOL_HINT,
} from "../prompts";
import { createLogger } from "./appLogger";
import { chooseProvider, invokeLlmJsonObject } from "./llmInvoke";

const log = createLogger("aiAgents");
import type {
  AnalyticsAgentInsightsMeta,
  AnalyticsAgentInsightsResponse,
} from "../shared/api-types";

export type AgentInsightKey =
  | "salesOptimizer"
  | "routePlanner"
  | "salesCoach"
  | "productAnalyzer"
  | "customerInsights";

const FALLBACK_INSIGHTS: Record<AgentInsightKey, string> = {
  salesOptimizer: `Analiza sprzedaży (tryb offline):
1. Porównaj kategorie i marże z ubiegłych okresów.
2. Optymalne okna kontaktu z klientem B2B: wtorek–czwartek, przedpołudnie.
3. Rekomendacja: zweryfikuj politykę rabatową na produkty premium i upsell.`,
  routePlanner: `Propozycja planu tras (tryb offline):
1. Grupuj wizyty według kodu pocztowego / powiatu.
2. Priorytetyzuj klientów T1 przed T3.
3. Szacuj czas przejazdu i rezerwuj bufor 15 minut między spotkaniami.`,
  salesCoach: `Porady coachingowe (tryb offline):
1. Buduj długoterminowe relacje z decydentami technicznymi i zakupowymi.
2. Pakietuj produkty komplementarne zamiast pojedynczych SKU.
3. Wykorzystuj krzyżową sprzedaż w obrębie tej samej kategorii.`,
  productAnalyzer: `Analiza kategorii (tryb offline):
1. Zidentyfikuj kategorie o najwyższej marży jednostkowej.
2. Odsiej produkty z rotacją poniżej mediany.
3. Zaplanuj promocję dla pozycji z nadmiarem zapasu.`,
  customerInsights: `Profil klienta (tryb offline):
- Preferuje stabilne dostawy i przewidywalne terminy.
- Wartość relacji rośnie z szerokością asortymentu.
- Potencjał wzrostu: negocjacja warunków logistycznych i limitów kredytowych.`,
};

function safeJsonPayload(data: unknown): string {
  try {
    const s = JSON.stringify(
      data,
      (_key, value) => {
        if (value instanceof Set) return [...value];
        if (value instanceof Map) return Object.fromEntries(value);
        if (typeof value === "bigint") return value.toString();
        return value;
      },
      0
    );
    return s.length > 18000 ? `${s.slice(0, 18000)}\n…[ucięte]` : s;
  } catch {
    return "{}";
  }
}

import { stripJsonFences as stripCodeFences } from "../utils/llmJson";

function parseInsightsField(raw: string): string | null {
  const cleaned = stripCodeFences(raw);
  try {
    const p = JSON.parse(cleaned) as { insights?: unknown };
    if (typeof p.insights === "string" && p.insights.trim()) {
      return p.insights.trim();
    }
  } catch {
    return null;
  }
  return null;
}

function parseOptimizedRoute(raw: string): string | null {
  const cleaned = stripCodeFences(raw);
  try {
    const p = JSON.parse(cleaned) as { optimizedRoute?: unknown };
    if (typeof p.optimizedRoute === "string" && p.optimizedRoute.trim()) {
      return p.optimizedRoute.trim();
    }
  } catch {
    return null;
  }
  return null;
}

function systemForAgent(agentType: AgentInsightKey): string {
  const toolHint = AGENT_INSIGHT_TOOL_HINT;
  const jsonHint = AGENT_INSIGHT_JSON_HINT;

  switch (agentType) {
    case "salesOptimizer":
      return `Jesteś starszym menedżerem sprzedaży B2B.\n${toolHint}\n${jsonHint}`;
    case "salesCoach":
      return `Jesteś coachem sprzedaży B2B.\n${toolHint}\n${jsonHint}`;
    case "productAnalyzer":
      return `Jesteś analitykiem produktowym. Użyj getTopProducts i getLowStockAlerts.\n${toolHint}\n${jsonHint}`;
    case "customerInsights":
      return `Jesteś analitykiem CRM. Użyj calculateCustomerLTV gdy znasz NIP klienta.\n${toolHint}\n${jsonHint}`;
    case "routePlanner":
      return `Jesteś planistą logistyki field sales.\n${jsonHint}`;
    default:
      return `Jesteś analitykiem biznesowym.\n${toolHint}\n${jsonHint}`;
  }
}

export type RunAgentInsightOptions = {
  /** Plik w uploads/ — włącza ReAct + function calling zamiast wklejania dużego JSON */
  filename?: string;
  organizationId?: string;
};

export async function runAgentInsight(
  agentType: AgentInsightKey,
  data: unknown,
  options?: RunAgentInsightOptions
): Promise<AnalyticsAgentInsightsResponse> {
  const fallbackText = FALLBACK_INSIGHTS[agentType];
  const provider = chooseProvider();

  if (provider === "none") {
    return {
      insights: fallbackText,
      meta: { provider: "fallback", model: "placeholder" },
    };
  }

  const system = systemForAgent(agentType);
  const compactContext =
    typeof data === "object" && data !== null
      ? safeJsonPayload({
          agentType,
          keys: Object.keys(data as object).slice(0, 20),
          sample: data,
        })
      : safeJsonPayload({ agentType, data });

  if (options?.filename?.trim()) {
    const organizationId = options.organizationId;
    if (!organizationId) {
      return {
        insights: fallbackText,
        meta: {
          provider: `${provider}-missing-org`,
          model: "placeholder",
          orchestration: "react-tools-missing-organization",
        },
      };
    }
    try {
      const ctx = new SalesWorkbookContext(
        options.filename.trim(),
        organizationId
      );
      return await runAgentToolInsightLoop(
        ctx,
        system,
        `Typ agenta: ${agentType}\nKontekst UI (skrót, nie pełny dump):\n${compactContext.slice(0, 2500)}`
      );
    } catch (e) {
      log.error(`Tool loop error (${agentType})`, e);
      return {
        insights: fallbackText,
        meta: {
          provider: `${provider}-error-fallback`,
          model: "placeholder",
          orchestration: "react-tools-agent-insight-failed",
        },
      };
    }
  }

  const user = `Typ agenta: ${agentType}\nDane wejściowe (JSON):\n${safeJsonPayload(data)}`;

  try {
    const { raw, provider: used } = await invokeLlmJsonObject({
      system,
      user,
      temperature: 0.35,
    });
    const insights = parseInsightsField(raw);
    if (insights) {
      return {
        insights,
        meta: {
          provider: used,
          model: used === "anthropic" ? "claude" : "openai",
          orchestration: "legacy-json-payload",
        },
      };
    }
  } catch (e) {
    log.error(`LLM error (${agentType})`, e);
    return {
      insights: fallbackText,
      meta: {
        provider: `${provider}-error-fallback`,
        model: "placeholder",
      },
    };
  }

  return {
    insights: fallbackText,
    meta: {
      provider: `${provider}-parsed-empty`,
      model: "placeholder",
    },
  };
}

export async function runRouteOptimization(args: {
  visits: unknown;
  priorities: unknown;
}): Promise<{ optimizedRoute: string; meta: AnalyticsAgentInsightsMeta }> {
  const provider = chooseProvider();
  const fallback = FALLBACK_INSIGHTS.routePlanner;

  if (provider === "none") {
    return {
      optimizedRoute: fallback,
      meta: { provider: "fallback", model: "placeholder" },
    };
  }

  const system = `Jesteś planistą tras dla handlowców B2B w Polsce.
Dostajesz JSON z polami visits (analiza wizyt) i priorities (priorytety klientów).
Zwróć WYŁĄCZNIE JSON: {"optimizedRoute": string} — pole optimizedRoute: plan w 5–15 punktach numerowanych, z uwzględnieniem kolejności geograficznej i priorytetów.`;

  const user = safeJsonPayload(args);

  try {
    const { raw, provider: used } = await invokeLlmJsonObject({
      system,
      user,
      temperature: 0.3,
    });
    const text = parseOptimizedRoute(raw);
    if (text) {
      return {
        optimizedRoute: text,
        meta: {
          provider: used,
          model: used === "anthropic" ? "claude" : "openai",
        },
      };
    }
  } catch (e) {
    log.error("route optimization LLM error", e);
    return {
      optimizedRoute: fallback,
      meta: {
        provider: `${provider}-error-fallback`,
        model: "placeholder",
      },
    };
  }

  return {
    optimizedRoute: fallback,
    meta: {
      provider: `${provider}-parsed-empty`,
      model: "placeholder",
    },
  };
}
