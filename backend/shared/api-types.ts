/**
 * Wspólne typy odpowiedzi API (backend + frontend przez alias @shared).
 * Nie importuj tutaj Zod — tylko czyste typy TypeScript.
 */

export type AiInsightPriority = "high" | "medium" | "low";

export interface AISuggestion {
  title: string;
  description: string;
  priority: AiInsightPriority;
}

export interface AiInsightsMeta {
  provider: string;
  productCount: number;
  /** Brak wierszy sprzedaży / produktów do analizy rotacji */
  emptyDataset?: boolean;
}

export interface AiInsightsResponse {
  suggestions: AISuggestion[];
  meta: AiInsightsMeta;
}

/** Wiersz metryk rotacji używany przez moduł AI (buildProductRotationMetrics) */
export interface ProductRotationMetricRow {
  id: string;
  name: string;
  category: string;
  rotationRate: number;
  totalQuantity: number;
  totalValue: number;
}

export interface ProductSalePoint {
  quantity: number;
  value: number;
}

/** Produkt zwracany z analizy rotacji (lista produktów) */
export interface Product {
  id: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  rotationRate: number;
  sales: ProductSalePoint[];
  totalQuantity: number;
  totalValue: number;
}

export interface ProductAnalysisResponse {
  products: Product[];
  seasonalTrends: Record<string, Record<number, number> | number[]>;
  totalProducts: number;
  categories: string[];
}

export interface DashboardTopProduct {
  name: string;
  value: number;
  quantity: number;
}

/** Odpowiedź POST /analytics/dashboard */
export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  topProducts: DashboardTopProduct[];
  customerRetention: number;
  uniqueCustomers: number;
  rawDataSample: Record<string, unknown>[];
}

export interface TestDataInfoResponse {
  testFileExists: boolean;
  testFilePath: string | null;
  message: string;
}

export interface PaymentOverdueRecord {
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  dueDate: string;
  status: string;
  daysOverdue: number;
}

export interface SendReminderResponse {
  success: boolean;
  message: string;
}

export interface UploadResponse {
  filename: string;
  originalName: string;
  size: number;
}

export interface ApiErrorBody {
  error: string;
  details?: string | unknown;
}

export type CustomerProfilesResponse = Record<string, unknown>;

export interface VisitPlanEntry {
  customerId: string;
  customerName: string;
  city: string;
  tier: string;
  nextVisit: string;
  priority: string;
  totalValue: number;
  totalOrders: number;
}

export type VisitPlanResponse = VisitPlanEntry[];

export interface AiInsightsLegacyResponse {
  insights: string;
  /** Obecne wywołania POST /analytics/ai-insights zwracają meta LLM. */
  meta?: AnalyticsAgentInsightsMeta;
}

/** Meta dla odpowiedzi POST /analytics/ai-insights (agenty legacy → LLM) */
export interface AnalyticsAgentInsightsMeta {
  provider: string;
  model?: string;
}

export interface AnalyticsAgentInsightsResponse {
  insights: string;
  meta: AnalyticsAgentInsightsMeta;
}

/** Rekomendacja z hybrydy reguł + LLM (kompleksowa analiza) */
export interface HybridAiRecommendation {
  title: string;
  description: string;
  action: string;
  priority: string;
  category?: string;
  impact?: string;
}

export interface HybridRecommendationsMeta {
  provider: string;
  model?: string;
  source: "llm" | "rules" | "hybrid";
}

/** POST /analytics/comprehensive-expert-ai — analiza ekspercka (sprzedaż, finanse, marketing) */
export interface ComprehensiveExpertAction {
  title: string;
  description: string;
  priority: AiInsightPriority;
}

export interface ComprehensiveExpertAiResponse {
  sales: string;
  finance: string;
  marketing: string;
  executiveSummary: string;
  priorityActions: ComprehensiveExpertAction[];
  meta: {
    provider: string;
    model?: string;
  };
}
