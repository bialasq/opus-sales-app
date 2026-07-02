import { createLogger } from "./appLogger";
import { chooseProvider, invokeLlmJsonObject } from "./llmInvoke";

const log = createLogger("recommendationEnricher");
import type {
  HybridAiRecommendation,
  HybridRecommendationsMeta,
} from "../shared/api-types";

export type RecommendationContext = {
  visitAnalysis: unknown;
  salesAnalysis: unknown;
  paymentAnalysis: unknown;
  metrics: unknown;
};

function buildDigest(ctx: RecommendationContext): Record<string, unknown> {
  const visit = ctx.visitAnalysis as {
    totalVisits?: number;
    conversionRate?: string | number;
    salesVisits?: number;
  } | null;
  const sales = ctx.salesAnalysis as {
    totalRevenue?: number;
    totalMargin?: number;
    inactiveProducts?: { product: string }[];
  } | null;
  const pay = ctx.paymentAnalysis as {
    totalOutstanding?: number;
    overduePayments?: unknown[];
  } | null;
  const metrics = ctx.metrics as { revenuePerKilometer?: string | number } | null;

  return {
    visits: visit
      ? {
          totalVisits: visit.totalVisits,
          conversionRate: visit.conversionRate,
          salesVisits: visit.salesVisits,
        }
      : null,
    sales: sales
      ? {
          totalRevenue: sales.totalRevenue,
          totalMargin: sales.totalMargin,
          inactiveSample: (sales.inactiveProducts || []).slice(0, 5).map((p) => p.product),
        }
      : null,
    payments: pay
      ? {
          totalOutstanding: pay.totalOutstanding,
          overdueCount: Array.isArray(pay.overduePayments) ? pay.overduePayments.length : 0,
        }
      : null,
    metrics: metrics ? { revenuePerKilometer: metrics.revenuePerKilometer } : null,
  };
}

/** Rekomendacje deterministyczne (reguły liczbowe) — pierwszy krok hybrydy. */
export function buildRuleBasedRecommendations(
  data: RecommendationContext
): HybridAiRecommendation[] {
  const recommendations: HybridAiRecommendation[] = [];

  const visitAnalysis = data.visitAnalysis as {
    conversionRate?: number;
    visitsByRegion?: Record<
      string,
      { total: number; sales: number; nonSales: number }
    >;
  } | null;

  if (visitAnalysis) {
    const conv = Number(visitAnalysis.conversionRate ?? 0);
    if (conv < 30) {
      recommendations.push({
        title: "Niska konwersja wizyt",
        description: `Wskaźnik konwersji wynosi tylko ${conv}%. Rozważ szkolenie handlowców lub rewizję strategii sprzedażowej.`,
        action: "Zorganizuj warsztaty sprzedażowe dla zespołu",
        priority: "high",
      });
    }

    const underperformingRegions = Object.entries(
      visitAnalysis.visitsByRegion || {}
    ).filter(([, regionData]) => {
      const convRate =
        regionData.total > 0 ? (regionData.sales / regionData.total) * 100 : 0;
      return convRate < 25 && regionData.total > 5;
    });

    if (underperformingRegions.length > 0) {
      recommendations.push({
        title: "Regiony wymagające uwagi",
        description: `Województwa ${underperformingRegions
          .map((r) => r[0])
          .join(", ")} mają niską konwersję. Przeanalizuj lokalne warunki rynkowe.`,
        action: "Przeprowadź analizę konkurencji w tych regionach",
        priority: "medium",
      });
    }
  }

  const salesAnalysis = data.salesAnalysis as {
    inactiveProducts?: Array<{ product: string }>;
    totalRevenue?: number;
    totalMargin?: number;
  } | null;

  if (salesAnalysis) {
    if (
      salesAnalysis.inactiveProducts &&
      salesAnalysis.inactiveProducts.length > 0
    ) {
      const topInactive = salesAnalysis.inactiveProducts.slice(0, 3);
      recommendations.push({
        title: "Produkty bez sprzedaży",
        description: `Produkty: ${topInactive
          .map((p) => p.product)
          .join(", ")} nie były sprzedawane od ponad 2 miesięcy.`,
        action: "Rozważ promocję -30% lub wycofanie z oferty",
        priority: "high",
      });
    }

    const avgMarginRate =
      (salesAnalysis.totalRevenue ?? 0) > 0
        ? ((salesAnalysis.totalMargin ?? 0) / (salesAnalysis.totalRevenue ?? 1)) * 100
        : 0;
    if (avgMarginRate < 20) {
      recommendations.push({
        title: "Niska średnia marża",
        description: `Średnia marża wynosi ${avgMarginRate.toFixed(
          1
        )}%. Przeanalizuj strukturę kosztów i politykę cenową.`,
        action: "Renegocjuj warunki z dostawcami lub podnieś ceny",
        priority: "high",
      });
    }
  }

  const paymentAnalysis = data.paymentAnalysis as {
    overduePayments?: unknown[];
    totalOutstanding?: number;
  } | null;

  if (
    paymentAnalysis &&
    Array.isArray(paymentAnalysis.overduePayments) &&
    paymentAnalysis.overduePayments.length > 5
  ) {
    recommendations.push({
      title: "Wysoka liczba zaległych płatności",
      description: `${paymentAnalysis.overduePayments.length} faktur jest przeterminowanych na łączną kwotę ${(
        paymentAnalysis.totalOutstanding ?? 0
      ).toFixed(2)} PLN.`,
      action: "Natychmiast wyślij przypomnienia i rozważ windykację",
      priority: "high",
    });
  }

  const metrics = data.metrics as { revenuePerKilometer?: string | number } | null;

  if (metrics && Number(metrics.revenuePerKilometer) < 50) {
    recommendations.push({
      title: "Niska efektywność transportowa",
      description: `Przychód na kilometr wynosi tylko ${metrics.revenuePerKilometer} PLN. Optymalizuj trasy i zwiększ wartość wizyt.`,
      action: "Wdrożyć system planowania tras i łączenia wizyt",
      priority: "medium",
    });
  }

  return recommendations;
}

function normalizePriority(p: unknown): "high" | "medium" | "low" {
  if (p === "high" || p === "medium" || p === "low") return p;
  return "medium";
}

import { stripJsonFences } from "../utils/llmJson";

function parseLlmRecommendations(raw: string): HybridAiRecommendation[] | null {
  const cleaned = stripJsonFences(raw);
  try {
    const parsed = JSON.parse(cleaned) as { recommendations?: unknown[] };
    const list = parsed.recommendations;
    if (!Array.isArray(list) || list.length === 0) return null;
    const out: HybridAiRecommendation[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      if (
        typeof o.title !== "string" ||
        typeof o.description !== "string" ||
        typeof o.action !== "string"
      ) {
        continue;
      }
      out.push({
        title: o.title,
        description: o.description,
        action: o.action,
        priority: normalizePriority(o.priority),
        category: typeof o.category === "string" ? o.category : undefined,
        impact: typeof o.impact === "string" ? o.impact : undefined,
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

const SYSTEM_ENRICH = `Jesteś doświadczonym konsultantem B2B (PL) — łączysz dane liczbowe z narracją dla zarządu i handlu.

Dostajesz JSON z polami:
- ruleBasedRecommendations: lista rekomendacji wygenerowanych deterministycznie (mogą być puste).
- digest: skrót metryk (wizyty, sprzedaż, płatności, efektywność).

Zwróć WYŁĄCZNIE JSON w formacie:
{"recommendations":[{"title":"string","description":"string","action":"string","priority":"high"|"medium"|"low","category":"string (opcjonalnie)","impact":"string (opcjonalnie)"}]}

Wymagania:
- 4–12 pozycji; po polsku; konkretnie pod digest i reguły.
- Nie zaprzeczaj faktom z ruleBased — rozwijaj, scal duplikaty, dodaj kontekst biznesowy.
- Jeśli ruleBased jest puste, zbuduj rekomendacje wyłącznie z digest (ogólne, ale mierzalne).`;

/**
 * Hybryda: reguły → LLM wzbogaca i scala. Bez klucza API zwraca wyłącznie reguły + meta fallback.
 */
export async function generateHybridAIRecommendations(
  ctx: RecommendationContext
): Promise<{
  recommendations: HybridAiRecommendation[];
  meta: HybridRecommendationsMeta;
}> {
  const rules = buildRuleBasedRecommendations(ctx);
  const digest = buildDigest(ctx);
  const provider = chooseProvider();

  if (provider === "none") {
    return {
      recommendations: rules,
      meta: {
        provider: "fallback",
        model: "rules",
        source: "rules",
      },
    };
  }

  const userPayload = JSON.stringify({
    ruleBasedRecommendations: rules,
    digest,
  });

  const user =
    userPayload.length > 28000
      ? userPayload.slice(0, 28000) + "\n…[ucięte]"
      : userPayload;

  try {
    const { raw, provider: used } = await invokeLlmJsonObject({
      system: SYSTEM_ENRICH,
      user,
      temperature: 0.3,
    });
    const llmList = parseLlmRecommendations(raw);
    if (llmList && llmList.length > 0) {
      return {
        recommendations: llmList,
        meta: {
          provider: used,
          model: used === "anthropic" ? "claude" : "openai",
          source: rules.length ? "hybrid" : "llm",
        },
      };
    }
  } catch (e) {
    log.error("LLM error", e);
    return {
      recommendations: rules,
      meta: {
        provider: `${provider}-error-fallback`,
        model: "rules",
        source: "rules",
      },
    };
  }

  return {
    recommendations: rules,
    meta: {
      provider: `${provider}-parsed-empty`,
      model: "rules",
      source: "rules",
    },
  };
}
