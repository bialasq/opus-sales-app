import OpenAI from "openai";
import type { ComprehensiveExpertAiResponse } from "../shared/api-types";
import { chooseProvider } from "./llmInvoke";

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

function fallbackExpert(analysis: unknown): ComprehensiveExpertAiResponse {
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

  const sales = `Analiza sprzedażowa (tryb bez modelu LLM): przychód ${Number(s.totalRevenue || 0).toFixed(0)} PLN, wizyty ${Number(s.totalVisits || 0)}, konwersja ${Number(s.conversionRate || 0).toFixed(1)}%.\n${lines || "Brak dodatkowych rekomendacji regułowych — uzupełnij klucz API (OpenAI lub Anthropic), aby uzyskać pełną analizę ekspercką."}`;

  const finance = `Finanse (heurystyka): zaległości ${Number(s.overdueAmount || 0).toFixed(0)} PLN. Rozważ monitoring płatności i politykę kredytową.`;

  const marketing = `Marketing (heurystyka): wykorzystaj dane o produktach i regionach z analizy sprzedaży — skoncentruj kampanie na kategoriach z najlepszą marżą i regionach z niską konwersją.`;

  const executiveSummary = `Podsumowanie dla zarządu: wskaż priorytet na sprzedaż operacyjną, potem płynność (należności), następnie działania marketingowe wspierające konwersję.`;

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
    meta: { provider: "fallback", model: "rules" },
  };
}

function parseExpertJson(raw: string): ComprehensiveExpertAiResponse | null {
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
      meta: { provider: "llm", model: "parsed" },
    };
  } catch {
    return null;
  }
}

async function callOpenAiExpert(userPayload: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("MISSING_OPENAI");
  const client = new OpenAI({ apiKey });
  const model = process.env.AI_MODEL || "gpt-4o";
  const res = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Dane analizy (JSON):\n${userPayload}` },
    ],
  });
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("Empty OpenAI response");
  return text;
}

async function callAnthropicExpert(userPayload: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("MISSING_ANTHROPIC");
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [
        { role: "user", content: `Dane analizy (JSON):\n${userPayload}` },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 400)}`);
  }
  const body = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = body.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty Anthropic response");
  return text;
}

export async function runComprehensiveExpertAi(
  analysisData: unknown
): Promise<ComprehensiveExpertAiResponse> {
  const provider = chooseProvider();
  const payload = pruneForLlm(analysisData);

  if (provider === "none") {
    return fallbackExpert(analysisData);
  }

  try {
    const raw =
      provider === "anthropic"
        ? await callAnthropicExpert(payload)
        : await callOpenAiExpert(payload);
    const parsed = parseExpertJson(raw);
    if (parsed) {
      return {
        ...parsed,
        meta: { provider, model: provider === "anthropic" ? "claude" : "openai" },
      };
    }
    return {
      ...fallbackExpert(analysisData),
      meta: { provider: `${provider}-parsed-empty`, model: "fallback" },
    };
  } catch (e) {
    console.error("[comprehensiveExpertAi] LLM error:", e);
    return {
      ...fallbackExpert(analysisData),
      meta: { provider: `${provider}-error-fallback`, model: "fallback" },
    };
  }
}
