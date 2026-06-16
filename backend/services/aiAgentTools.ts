import type { ProductRotationMetricRow } from "../shared/api-types";
import {
  analyzeSalesFromFile,
  buildProductRotationMetrics,
} from "./salesMetrics";
import { assertFileOwnershipByOrg } from "./fileOwnership";
import { orgStorage } from "./orgStorage";
import { predictFutureSales } from "./salesForecast";
import {
  calculateRouteMatrix,
  WORK_DAY_MINUTES,
  DEFAULT_VISIT_MINUTES,
} from "./routeMatrix";
import { buildRouteVisitCandidates } from "./routeVisitCandidates";
import { checkBridgeAndFerry } from "./routeFerryChecks";

/** Metadane narzędzia dla OpenAI / Anthropic function calling (Cursor-friendly). */
export interface AIAgentTool {
  /** Nazwa funkcji, np. getTopProducts */
  name: string;
  /** Opis dla modelu — kiedy wywołać narzędzie */
  description: string;
  /** JSON Schema parametrów (OpenAI: parameters) */
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description?: string;
        enum?: string[];
      }
    >;
    required?: string[];
    additionalProperties?: boolean;
  };
  /** Wykonanie narzędzia w kontekście pliku Excel */
  execute: (
    ctx: SalesWorkbookContext,
    args: Record<string, unknown>
  ) => Promise<unknown>;
}

/** Kontekst danych sprzedażowych powiązany z plikiem w org-scoped storage */
export class SalesWorkbookContext {
  readonly filename: string;
  readonly organizationId: string;
  private productsCache: ProductRotationMetricRow[] | null = null;
  private salesAnalysisCache: SalesAnalysisShape | null = null;

  constructor(filename: string, organizationId: string) {
    this.filename = filename;
    this.organizationId = organizationId;
  }

  async getProducts(): Promise<ProductRotationMetricRow[]> {
    if (!this.productsCache) {
      this.productsCache = await buildProductRotationMetrics(
        this.filename,
        this.organizationId
      );
    }
    return this.productsCache;
  }

  async getSalesAnalysis(): Promise<SalesAnalysisShape> {
    if (!this.salesAnalysisCache) {
      this.salesAnalysisCache = (await analyzeSalesFromFile(
        this.filename,
        this.organizationId
      )) as SalesAnalysisShape;
    }
    return this.salesAnalysisCache;
  }
}

function parseBoundedInt(
  value: unknown,
  defaultVal: number,
  min: number,
  max: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function parseBoundedFloat(
  value: unknown,
  defaultVal: number,
  min: number,
  max: number
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultVal;
  return Math.min(max, Math.max(min, n));
}

function parseOptionalString(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const s = String(value).trim();
  return s || undefined;
}

type SalesAnalysisShape = {
  salesByCustomer?: Record<
    string,
    {
      name: string;
      revenue: number;
      orders: number;
      lastOrderDate?: Date;
      products?: Set<string>;
    }
  >;
  salesByProduct?: Record<
    string,
    { revenue: number; quantity: number; category?: string }
  >;
};

async function toolGetTopProducts(
  ctx: SalesWorkbookContext,
  args: Record<string, unknown>
): Promise<unknown> {
  const limit = parseBoundedInt(args.limit, 10, 1, 25);
  const products = await ctx.getProducts();
  return [...products]
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, limit)
    .map((p) => ({
      name: p.name,
      category: p.category,
      rotationRate: p.rotationRate,
      totalValue: p.totalValue,
      totalQuantity: p.totalQuantity,
    }));
}

async function toolGetLowStockAlerts(
  ctx: SalesWorkbookContext,
  args: Record<string, unknown>
): Promise<unknown> {
  const rotationThreshold = parseBoundedFloat(args.rotationThreshold, 0.35, 0.05, 0.95);
  const products = await ctx.getProducts();
  const stockoutRisk = products
    .filter((p) => p.rotationRate >= 0.65)
    .sort((a, b) => b.rotationRate - a.rotationRate)
    .slice(0, 8)
    .map((p) => ({
      type: "stockout_risk",
      product: p.name,
      rotationRate: p.rotationRate,
      message: "Wysoka rotacja — rozważ domówienie / zwiększenie zapasu",
    }));

  const overstock = products
    .filter((p) => p.rotationRate < rotationThreshold)
    .sort((a, b) => a.rotationRate - b.rotationRate)
    .slice(0, 8)
    .map((p) => ({
      type: "overstock_risk",
      product: p.name,
      rotationRate: p.rotationRate,
      message: "Niska rotacja — ryzyko zalegania, promocja lub wycofanie",
    }));

  return { stockoutRisk, overstock, rotationThresholdUsed: rotationThreshold };
}

async function toolPredictFutureSales(
  ctx: SalesWorkbookContext,
  args: Record<string, unknown>
): Promise<unknown> {
  const productName = parseOptionalString(args.productName);
  const horizonDays = parseBoundedInt(args.horizonDays, 30, 7, 90);
  return predictFutureSales(ctx.filename, ctx.organizationId, {
    productName,
    horizonDays,
  });
}

function storageKeyFromListed(orgId: string, listedKey: string): string {
  const prefix = `org_${orgId}/`;
  if (listedKey.startsWith(prefix)) return listedKey.slice(prefix.length);
  const slash = listedKey.lastIndexOf("/");
  return slash >= 0 ? listedKey.slice(slash + 1) : listedKey;
}

async function toolCompareWithPreviousPeriod(
  ctx: SalesWorkbookContext,
  _args: Record<string, unknown>
): Promise<unknown> {
  const store = orgStorage(ctx.organizationId);

  let currentMtime: number;
  try {
    await assertFileOwnershipByOrg(ctx.organizationId, ctx.filename);
    const currentMeta = await store.getMetadata(ctx.filename);
    if (!currentMeta) {
      return { found: false, message: "Brak bieżącego pliku" };
    }
    currentMtime = currentMeta.lastModified.getTime();
  } catch {
    return { found: false, message: "Brak bieżącego pliku" };
  }

  const currentProducts = await ctx.getProducts();
  const currentRevenue = currentProducts.reduce((s, p) => s + p.totalValue, 0);

  const listed = await store.listFiles("");
  const candidateEntries = await Promise.all(
    listed
      .map((key) => storageKeyFromListed(ctx.organizationId, key))
      .filter((f) => /\.(xlsx|xls)$/i.test(f) && f !== ctx.filename)
      .map(async (name) => {
        const meta = await store.getMetadata(name);
        if (!meta) return null;
        return { name, mtime: meta.lastModified.getTime() };
      })
  );
  const candidates = candidateEntries
    .filter((f): f is { name: string; mtime: number } => f !== null)
    .filter((f) => f.mtime < currentMtime)
    .sort((a, b) => b.mtime - a.mtime);

  if (!candidates.length) {
    return {
      found: false,
      message:
        "Brak wcześniejszego pliku Excel w organizacji — wgraj drugi plik aby porównać okresy",
    };
  }

  const previousFilename = candidates[0].name;
  const prevProducts = await buildProductRotationMetrics(
    previousFilename,
    ctx.organizationId
  );
  const prevRevenue = prevProducts.reduce((s, p) => s + p.totalValue, 0);
  const prevByName = new Map(prevProducts.map((p) => [p.name, p]));
  const currByName = new Map(currentProducts.map((p) => [p.name, p]));

  const revenueDeltaPct =
    prevRevenue > 0
      ? Number((((currentRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1))
      : null;

  const productDeltas: {
    product: string;
    revenueChangePct: number;
    rotationDelta: number;
  }[] = [];

  for (const [name, curr] of currByName) {
    const prev = prevByName.get(name);
    if (!prev) continue;
    const revenueChangePct =
      prev.totalValue > 0
        ? Number(
            (((curr.totalValue - prev.totalValue) / prev.totalValue) * 100).toFixed(1)
          )
        : 0;
    productDeltas.push({
      product: name,
      revenueChangePct,
      rotationDelta: Number((curr.rotationRate - prev.rotationRate).toFixed(3)),
    });
  }

  productDeltas.sort((a, b) => b.revenueChangePct - a.revenueChangePct);

  return {
    found: true,
    previousFilename,
    previousUploadedAt: new Date(candidates[0].mtime).toISOString(),
    currentRevenuePln: Number(currentRevenue.toFixed(2)),
    previousRevenuePln: Number(prevRevenue.toFixed(2)),
    revenueDeltaPct,
    topGainers: productDeltas.filter((d) => d.revenueChangePct > 5).slice(0, 5),
    topDecliners: [...productDeltas]
      .filter((d) => d.revenueChangePct < -5)
      .sort((a, b) => a.revenueChangePct - b.revenueChangePct)
      .slice(0, 5),
    newProducts: currentProducts
      .filter((p) => !prevByName.has(p.name))
      .slice(0, 5)
      .map((p) => p.name),
    droppedProducts: prevProducts
      .filter((p) => !currByName.has(p.name))
      .slice(0, 5)
      .map((p) => p.name),
  };
}

async function toolCalculateRouteMatrix(
  _ctx: SalesWorkbookContext,
  args: Record<string, unknown>
): Promise<unknown> {
  const raw = args.locations;
  const locations = Array.isArray(raw)
    ? raw.map((x) => String(x)).filter(Boolean)
    : typeof raw === "string"
      ? raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : [];
  return calculateRouteMatrix(locations);
}

async function toolListRouteVisitCandidates(
  ctx: SalesWorkbookContext,
  args: Record<string, unknown>
): Promise<unknown> {
  const limit = parseBoundedInt(args.limit, 25, 1, 40);
  const onlyReachable = args.onlyReachable !== false;
  const data = await buildRouteVisitCandidates(ctx.filename, ctx.organizationId);
  let list = data.candidates;
  if (onlyReachable) {
    list = list.filter((c) => c.reachableFromBase);
  }
  return {
    baseCity: data.baseCity,
    matrixNote: data.matrixNote,
    candidates: list.slice(0, limit),
    guardrails: {
      workDayMinutes: WORK_DAY_MINUTES,
      visitMinutesPerClient: DEFAULT_VISIT_MINUTES,
      maxDrivingHoursPerDay: 4,
      maxOneWayHoursFromBase: 2,
    },
  };
}

async function toolCheckBridgeAndFerry(
  _ctx: SalesWorkbookContext,
  args: Record<string, unknown>
): Promise<unknown> {
  const raw = args.route ?? args.cities ?? args.locations;
  const cities = Array.isArray(raw)
    ? raw.map((x) => String(x)).filter(Boolean)
    : typeof raw === "string"
      ? raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : [];
  if (!cities.length) {
    return { error: "Podaj route: tablica miast lub nazwy po przecinku" };
  }
  return checkBridgeAndFerry(cities);
}

async function toolCalculateCustomerLTV(
  ctx: SalesWorkbookContext,
  args: Record<string, unknown>
): Promise<unknown> {
  const customerId = parseOptionalString(args.customerId) ?? "";
  if (!customerId) {
    return { error: "customerId (NIP) jest wymagany" };
  }

  const sales = await ctx.getSalesAnalysis();
  const byCustomer = sales.salesByCustomer || {};
  const entry = byCustomer[customerId];
  if (!entry) {
    return {
      customerId,
      found: false,
      message: "Brak sprzedaży dla tego NIP w pliku",
    };
  }

  const productCount = entry.products?.size ?? 0;
  const avgOrderValue = entry.orders > 0 ? entry.revenue / entry.orders : 0;
  const estimatedLtv = Number((entry.revenue * (1 + Math.min(entry.orders / 12, 2))).toFixed(2));

  return {
    customerId,
    customerName: entry.name,
    found: true,
    totalRevenue: entry.revenue,
    orderCount: entry.orders,
    avgOrderValue: Number(avgOrderValue.toFixed(2)),
    distinctProducts: productCount,
    estimatedLtvPln: estimatedLtv,
    lastOrderDate: entry.lastOrderDate?.toISOString?.() ?? null,
    note: "estimatedLtvPln = heurystyka: przychód × współczynnik powtarzalności zamówień",
  };
}

/** Rejestr narzędzi dostępnych dla agentów i workflow ReAct */
export const SALES_AGENT_TOOLS: AIAgentTool[] = [
  {
    name: "getTopProducts",
    description:
      "Zwraca top produkty wg przychodu (rotacja, kategoria). Użyj na początku analizy asortymentu.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Liczba produktów (1–25), domyślnie 10",
        },
      },
      additionalProperties: false,
    },
    execute: toolGetTopProducts,
  },
  {
    name: "getLowStockAlerts",
    description:
      "Wykrywa anomalie rotacji: ryzyko braków (wysoka rotacja) i zalegania (niska rotacja). Chain-of-thought: najpierw oceń te alerty, potem rekomendacje.",
    parameters: {
      type: "object",
      properties: {
        rotationThreshold: {
          type: "number",
          description: "Próg niskiej rotacji 0–1, domyślnie 0.35",
        },
      },
      additionalProperties: false,
    },
    execute: toolGetLowStockAlerts,
  },
  {
    name: "calculateCustomerLTV",
    description:
      "Oblicza przybliżone LTV i metryki klienta po NIP (Klient_NIP). Użyj przy analizie konkretnego klienta.",
    parameters: {
      type: "object",
      properties: {
        customerId: {
          type: "string",
          description: "NIP klienta (Klient_NIP)",
        },
      },
      required: ["customerId"],
      additionalProperties: false,
    },
    execute: toolCalculateCustomerLTV,
  },
  {
    name: "compareWithPreviousPeriod",
    description:
      "Porównuje bieżący plik z poprzednim wgranym Excel (.xlsx) w uploads/. Zwraca zmianę przychodu, top wzrosty/spadki SKU. Użyj przy ocenie trendu.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: toolCompareWithPreviousPeriod,
  },
  {
    name: "calculateRouteMatrix",
    description:
      "Szacuje dystans i czas jazdy między Olsztynem a miastami warmińsko-mazurskimi (60 km/h lokalne, 90 km/h S7/S16). Podaj locations: string[] nazw miast.",
    parameters: {
      type: "object",
      properties: {
        locations: {
          type: "string",
          description:
            "Lista miast: tablica JSON lub nazwy po przecinku, np. Ełk, Giżycko, Iława",
        },
      },
      required: ["locations"],
      additionalProperties: false,
    },
    execute: toolCalculateRouteMatrix,
  },
  {
    name: "listRouteVisitCandidates",
    description:
      "Lista klientów z arkusza Wizyty/Sprzedaż z priorytetem i czasem dojazdu z Olsztyna. Użyj przed ułożeniem trasy dnia.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max kandydatów (1–40)" },
        onlyReachable: {
          type: "boolean",
          description: "Tylko miasta w zasięgu 2h od bazy, domyślnie true",
        },
      },
      additionalProperties: false,
    },
    execute: toolListRouteVisitCandidates,
  },
  {
    name: "checkBridgeAndFerry",
    description:
      "Sprawdza trasę pod kątem promów i wąskich gardeł Mazur (np. Niegocin, Giżycko–Mikołajki). Wywołaj przed finalnym JSON trasy.",
    parameters: {
      type: "object",
      properties: {
        route: {
          type: "string",
          description:
            "Miasta na trasie: JSON array lub lista po przecinku, np. Olsztyn, Mrągowo, Giżycko",
        },
      },
      required: ["route"],
      additionalProperties: false,
    },
    execute: toolCheckBridgeAndFerry,
  },
  {
    name: "predictFutureSales",
    description:
      "Prognoza zapotrzebowania na 30 dni (regresja liniowa na historii Sprzedaż). Użyj przed sugestiami typu Domówienie — podaj productName dla jednego SKU lub pomiń dla całości.",
    parameters: {
      type: "object",
      properties: {
        productName: {
          type: "string",
          description: "Opcjonalna nazwa produktu",
        },
        horizonDays: {
          type: "number",
          description: "Horyzont prognozy 7–90 dni, domyślnie 30",
        },
      },
      additionalProperties: false,
    },
    execute: toolPredictFutureSales,
  },
];

export function getToolByName(name: string): AIAgentTool | undefined {
  return SALES_AGENT_TOOLS.find((t) => t.name === name);
}

export type OpenAIToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: AIAgentTool["parameters"];
  };
};

export const ROUTE_PLANNER_TOOL_NAMES = [
  "calculateRouteMatrix",
  "listRouteVisitCandidates",
  "checkBridgeAndFerry",
  "compareWithPreviousPeriod",
] as const;

export function getRoutePlannerTools(): AIAgentTool[] {
  return SALES_AGENT_TOOLS.filter((t) =>
    (ROUTE_PLANNER_TOOL_NAMES as readonly string[]).includes(t.name)
  );
}

export function toolsToOpenAIFormat(
  tools: AIAgentTool[] = SALES_AGENT_TOOLS
): OpenAIToolDefinition[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function executeAgentTool(
  ctx: SalesWorkbookContext,
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const toolName = String(name ?? "").trim();
  if (!toolName) {
    return { error: "Brak nazwy narzędzia w wywołaniu function calling" };
  }

  const safeArgs =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};

  const tool = getToolByName(toolName);
  if (!tool) {
    return { error: `Nieznane narzędzie: ${toolName}` };
  }
  try {
    return await tool.execute(ctx, safeArgs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg, tool: toolName };
  }
}
