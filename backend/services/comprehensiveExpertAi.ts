import type { ComprehensiveExpertAiResponse } from "../shared/api-types";
import { createLogger } from "./appLogger";
import { chooseProvider, getLlmConfigStatus, invokeLlmJsonObject } from "./llmInvoke";

const log = createLogger("comprehensiveExpertAi");

const SYSTEM = `Jesteś zespołem ekspertów B2B w jednej osobie:
- VP Sprzedaży (priorytet #1: pipeline, konwersja, produkty, regiony, zespół handlowy),
- CFO (płynność, marże, zaległości, ryzyko finansowe),
- CMO (pozycjonowanie, promocje, komunikacja, segmentacja).

Dostajesz JSON ze zagregowaną analizą kompleksową (wizyty, sprzedaż, faktury, metryki, istniejące rekomendacje regułowe).
Zwróć WYŁĄCZNIE poprawny JSON (bez markdown), po polsku, konkretnie pod dane:
{
  "sales": "string — 6–12 zdań: sprzedaż, produkty, regiony, działania",
  "finance": "string — 6–12 zdań: płynność, marże, zaległości, ryzyka",
  "marketing": "string — 6–12 zdań: kampanie, promocje, segmenty, przekaz",
  "executiveSummary": "string — 4–6 zdań dla zarządu",
  "priorityActions": [{"title":"string","description":"string","priority":"high"|"medium"|"low"}]
}
priorityActions: 4–8 pozycji, najpierw sprzedaż, potem finanse/marketing.`;

function pruneForLlm(analysis: unknown): string {
  const max = 28000;
  try {
    const o = analysis as Record<string, unknown>;
    const slim = {
      summary: o.summary,
      metrics: o.metrics,
      visitAnalysis: summarizeVisits(o.visitAnalysis),
      salesAnalysis: summarizeSales(o.salesAnalysis),
      paymentAnalysis: summarizePayments(o.paymentAnalysis),
      aiRecommendations: o.aiRecommendations,
    };
    let s = JSON.stringify(slim);
    if (s.length > max) {
      s = s.slice(0, max) + "\n…[ucięte]";
    }
    return s;
  } catch {
    return JSON.stringify({ error: "niepoprawny payload" }).slice(0, max);
  }
}

function summarizeVisits(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const x = v as Record<string, unknown>;
  return {
    totalVisits: x.totalVisits,
    conversionRate: x.conversionRate,
    visitsByRegion: x.visitsByRegion,
  };
}

function summarizeSales(s: unknown): unknown {
  if (!s || typeof s !== "object") return s;
  const x = s as Record<string, unknown>;
  return {
    totalRevenue: x.totalRevenue,
    totalMargin: x.totalMargin,
    topProducts: Array.isArray(x.topProducts) ? (x.topProducts as unknown[]).slice(0, 15) : x.topProducts,
    inactiveProducts: Array.isArray(x.inactiveProducts)
      ? (x.inactiveProducts as unknown[]).slice(0, 20)
      : x.inactiveProducts,
    salesByCategory: x.salesByCategory,
  };
}

function summarizePayments(p: unknown): unknown {
  if (!p || typeof p !== "object") return p;
  const x = p as Record<string, unknown>;
  const overdue = x.overduePayments;
  return {
    totalOutstanding: x.totalOutstanding,
    overdueCount: Array.isArray(overdue) ? overdue.length : 0,
    overdueSample: Array.isArray(overdue) ? overdue.slice(0, 15) : overdue,
  };
}

function fallbackExpert(
  analysis: unknown,
  setupHint?: string
): ComprehensiveExpertAiResponse {
  const a = analysis as {
    summary?: Record<string, number>;
    aiRecommendations?: Array<{ title: string; description: string; action?: string }>;
  };
  const s = a.summary || {};
  const recs = a.aiRecommendations || [];
  const lines = recs
    .slice(0, 6)
    .map((r) => `• ${r.title}: ${r.description}`)
    .join("\n");

  const apiNote =
    setupHint ||
    "Aby uzyskać pełną analizę AI (sprzedaż · finanse · marketing), ustaw OPENAI_API_KEY lub ANTHROPIC_API_KEY w backend/.env i zrestartuj serwer.";

  const sales = `Analiza sprzedażowa (tryb bez modelu LLM): przychód ${Number(s.totalRevenue || 0).toFixed(0)} PLN, wizyty ${Number(s.totalVisits || 0)}, konwersja ${Number(s.conversionRate || 0).toFixed(1)}%.\n${lines || apiNote}`;

  const finance = `Finanse (heurystyka): zaległości ${Number(s.overdueAmount || 0).toFixed(0)} PLN. Rozważ monitoring płatności i politykę kredytową.\n\n${apiNote}`;

  const marketing = `Marketing (heurystyka): wykorzystaj dane o produktach i regionach z analizy sprzedaży — skoncentruj kampanie na kategoriach z najlepszą marżą i regionach z niską konwersją.\n\n${apiNote}`;

  const executiveSummary = `Podsumowanie dla zarządu: wskaż priorytet na sprzedaż operacyjną, potem płynność (należności), następnie działania marketingowe wspierające konwersję. ${setupHint ? "" : " (Pełny raport LLM wymaga klucza API.)"}`;

  const priorityActions = recs.slice(0, 6).map((r) => ({
    title: r.title,
    description: r.description + (r.action ? ` — ${r.action}` : ""),
    priority: "medium" as const,
  }));

  return {
    sales,
    finance,
    marketing,
    executiveSummary,
    priorityActions,
    meta: {
      provider: "fallback",
      model: "rules",
      llmAvailable: false,
      setupHint: apiNote,
    },
  };
}

function parseExpertJson(
  raw: string,
  provider: string,
  model: string
): ComprehensiveExpertAiResponse | null {
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  try {
    const p = JSON.parse(cleaned) as Record<string, unknown>;
    if (
      typeof p.sales !== "string" ||
      typeof p.finance !== "string" ||
      typeof p.marketing !== "string" ||
      typeof p.executiveSummary !== "string"
    ) {
      return null;
    }
    const actions = Array.isArray(p.priorityActions) ? p.priorityActions : [];
    const priorityActions = actions
      .filter(
        (x): x is { title: string; description: string; priority: "high" | "medium" | "low" } =>
          x &&
          typeof (x as { title?: string }).title === "string" &&
          typeof (x as { description?: string }).description === "string" &&
          ["high", "medium", "low"].includes(String((x as { priority?: string }).priority))
      )
      .slice(0, 12);
    return {
      sales: p.sales,
      finance: p.finance,
      marketing: p.marketing,
      executiveSummary: p.executiveSummary,
      priorityActions,
      meta: { provider, model, llmAvailable: true },
    };
  } catch {
    return null;
  }
}

export async function runComprehensiveExpertAi(
  analysisData: unknown
): Promise<ComprehensiveExpertAiResponse> {
  const llmStatus = getLlmConfigStatus();
  const payload = pruneForLlm(analysisData);

  if (!llmStatus.available) {
    return fallbackExpert(analysisData, llmStatus.hint);
  }

  const provider = chooseProvider();

  try {
    const result = await invokeLlmJsonObject({
      system: SYSTEM,
      user: `Dane analizy (JSON):\n${payload}`,
      temperature: 0.2,
    });
    const parsed = parseExpertJson(result.raw, result.provider, result.model);
    if (parsed) {
      return {
        ...parsed,
        meta: {
          ...parsed.meta,
          setupHint: llmStatus.hint,
        },
      };
    }
    log.warn("Expert AI: empty or invalid JSON from model");
    return {
      ...fallbackExpert(
        analysisData,
        "Model zwrócił niepoprawny JSON — wyświetlono analizę z reguł. Spróbuj ponownie lub zmień model w .env."
      ),
      meta: {
        provider: `${provider}-parse-fallback`,
        model: result.model,
        llmAvailable: false,
        setupHint: llmStatus.hint,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error("LLM error", e);
    return {
      ...fallbackExpert(
        analysisData,
        `Błąd wywołania modelu (${provider}): ${msg.slice(0, 200)}. Sprawdź klucz API, limit lub model w .env.`
      ),
      meta: {
        provider: `${provider}-error-fallback`,
        model: "fallback",
        llmAvailable: false,
        setupHint: llmStatus.hint,
      },
    };
  }
}
