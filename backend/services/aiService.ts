import path from "path";
import OpenAI from "openai";
import type {
  AISuggestion,
  AiInsightsResponse,
  ProductRotationMetricRow,
} from "../shared/api-types";
import { chooseProvider } from "./llmInvoke";

export { chooseProvider } from "./llmInvoke";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const excelService = require("./excelService") as {
  readFile: (filePath: string) => Record<string, Record<string, unknown>[]>;
  analyzeSales: (salesData: Record<string, unknown>[]) => {
    salesByProduct: Record<
      string,
      { revenue: number; quantity: number; category?: string; lastSaleDate?: Date }
    >;
  };
};

function extractSalesRows(
  excelData: Record<string, Record<string, unknown>[]>
): Record<string, unknown>[] {
  if (excelData["Sprzedaż"]?.length) return excelData["Sprzedaż"];
  if (excelData["Sprzedaz"]?.length) return excelData["Sprzedaz"];
  for (const key of Object.keys(excelData)) {
    const rows = excelData[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const first = rows[0] as Record<string, unknown>;
    if (
      "Nazwa_Produktu" in first ||
      "Produkt" in first ||
      "Product" in first
    ) {
      return rows;
    }
  }
  return [];
}

/**
 * Buduje metryki produktów z danych sprzedaży (jak w analytics: arkusz Sprzedaż + analyzeSales).
 * rotationRate ∈ [0,1]: wyżej = lepsza rotacja / popyt względem reszty asortymentu.
 */
export function buildProductRotationMetrics(
  filename: string
): ProductRotationMetricRow[] {
  const filePath = path.join(__dirname, "..", "uploads", filename);
  const excelData = excelService.readFile(filePath);
  const rows = extractSalesRows(excelData);
  if (!rows.length) return [];

  const sales = excelService.analyzeSales(rows as Record<string, unknown>[]);
  const byProduct = sales.salesByProduct || {};
  const entries = Object.entries(byProduct);
  if (!entries.length) return [];

  const maxRev = Math.max(...entries.map(([, v]) => v.revenue), 1e-9);
  const maxQty = Math.max(...entries.map(([, v]) => v.quantity), 1e-9);

  return entries.map(([name, v]) => {
    const revNorm = v.revenue / maxRev;
    const qtyNorm = v.quantity / maxQty;
    const rotationRate = Number(((revNorm + qtyNorm) / 2).toFixed(4));
    return {
      id: name,
      name,
      category: v.category || "Inne",
      rotationRate,
      totalQuantity: v.quantity,
      totalValue: v.revenue,
    };
  });
}

const SYSTEM_PROMPT = `Jesteś analitykiem sprzedaży B2B. Dostajesz JSON z listą produktów: name, category, rotationRate (0–1, wyżej = lepsza rotacja względem asortymentu), totalQuantity, totalValue (PLN).
Zadanie:
1) Wskaż produkty wymagające NATYCHMIASTOWEJ PROMOCJI (niska rotacja, ryzyko zalegania, słaby obrót).
2) Wskaż produkty do DOMÓWIENIA / zwiększenia stanu (wysoka rotacja, ryzyko braków, silny popyt).
Zwróć WYŁĄCZNIE poprawny JSON w formacie:
{"suggestions":[{"title":"string","description":"string","priority":"high"|"medium"|"low"}]}
— 4–8 sugestii, po polsku, konkretne nazwy produktów w tytule lub opisie. Priorytet: high = pilne, medium = ważne, low = warto rozważyć.`;

function parseInsightsJson(raw: string): AISuggestion[] {
  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    suggestions?: Partial<AISuggestion>[];
  };
  const list = parsed.suggestions;
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (s): s is AISuggestion =>
        typeof s?.title === "string" &&
        typeof s?.description === "string" &&
        (s.priority === "high" || s.priority === "medium" || s.priority === "low")
    )
    .slice(0, 12);
}

function fallbackInsights(
  products: ProductRotationMetricRow[]
): AISuggestion[] {
  const sortedLow = [...products].sort((a, b) => a.rotationRate - b.rotationRate);
  const sortedHigh = [...products].sort((a, b) => b.rotationRate - a.rotationRate);
  const out: AISuggestion[] = [];

  for (const p of sortedLow.slice(0, 3)) {
    if (p.rotationRate >= 0.4) continue;
    out.push({
      title: `Promocja: ${p.name}`,
      description: `Niska rotacja (${(p.rotationRate * 100).toFixed(1)}%) i wartość ${p.totalValue.toFixed(0)} PLN — rozważ rabat, bundling lub wycofanie z magazynu.`,
      priority: p.rotationRate < 0.25 ? "high" : "medium",
    });
  }

  for (const p of sortedHigh.slice(0, 3)) {
    if (p.rotationRate <= 0.55) continue;
    out.push({
      title: `Domówienie: ${p.name}`,
      description: `Wysoka rotacja (${(p.rotationRate * 100).toFixed(1)}%), ilość ${p.totalQuantity} szt. — zwiększ zapas, aby uniknąć braków.`,
      priority: p.rotationRate > 0.8 ? "high" : "medium",
    });
  }

  if (out.length === 0 && products.length > 0) {
    out.push({
      title: "Brak wyraźnych priorytetów",
      description:
        "Rotacja produktów jest zbliżona do średniej — rozważ dłuższy horyzont danych lub dodatkowe segmenty.",
      priority: "low",
    });
  }
  return out.slice(0, 8);
}

async function callOpenAiInsights(userPayload: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("MISSING_OPENAI");
  const client = new OpenAI({ apiKey });
  const model = process.env.AI_MODEL || "gpt-4o";
  const res = await client.chat.completions.create({
    model,
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Dane produktów (JSON):\n${userPayload}`,
      },
    ],
  });
  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("Empty OpenAI response");
  return text;
}

async function callAnthropicInsights(userPayload: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("MISSING_ANTHROPIC");
  const model =
    process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Dane produktów (JSON):\n${userPayload}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 500)}`);
  }

  const body = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = body.content?.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty Anthropic response");
  return text;
}

/**
 * Zwraca sugestie AI (promocja vs domówienie) na podstawie danych sprzedażowych z pliku.
 */
export async function getAiInsightsForFile(
  filename: string
): Promise<AiInsightsResponse> {
  const products = buildProductRotationMetrics(filename);
  const top = [...products]
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 45);
  const payload = JSON.stringify(top);

  const provider = chooseProvider();

  if (top.length === 0) {
    return {
      suggestions: [],
      meta: {
        provider: provider === "none" ? "fallback" : provider,
        productCount: 0,
        emptyDataset: true,
      },
    };
  }

  if (provider === "none") {
    return {
      suggestions: fallbackInsights(products),
      meta: { provider: "fallback", productCount: products.length },
    };
  }

  try {
    const raw =
      provider === "anthropic"
        ? await callAnthropicInsights(payload)
        : await callOpenAiInsights(payload);
    let suggestions: AISuggestion[];
    try {
      suggestions = parseInsightsJson(raw);
    } catch {
      suggestions = [];
    }
    if (!suggestions.length) {
      return {
        suggestions: fallbackInsights(products),
        meta: { provider: `${provider}-parsed-empty`, productCount: products.length },
      };
    }
    return {
      suggestions,
      meta: { provider, productCount: products.length },
    };
  } catch (e) {
    console.error("[aiService] LLM error:", e);
    return {
      suggestions: fallbackInsights(products),
      meta: {
        provider: `${provider}-error-fallback`,
        productCount: products.length,
      },
    };
  }
}

export type {
  AISuggestion as AiInsight,
  AiInsightPriority,
  ProductRotationMetricRow as ProductRotationRow,
  AiInsightsResponse,
} from "../shared/api-types";
