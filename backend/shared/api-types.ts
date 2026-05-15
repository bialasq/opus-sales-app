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

/** Wynik ewaluacji grounding (agentEval) */
export interface AISuggestionEval {
  verified: boolean;
  evalFlags?: string[];
  potential_hallucination?: boolean;
  matchedFact?: string;
}

export interface EvaluatedAISuggestion extends AISuggestion {
  eval?: AISuggestionEval;
}

/** Krok ReAct: Thought → Action → Observation (wynik narzędzia) */
export interface ReActTraceStep {
  thought: string;
  action: string;
  actionInput?: Record<string, unknown>;
  observation?: string;
}

/** Fakty z kroku 1 (Analityk) — bez rekomendacji biznesowych */
export interface AnalystFactsPayload {
  summary: string;
  anomalies: string[];
  metrics?: Record<string, unknown>;
  toolSnapshots?: Record<string, unknown>;
}

export interface AiInsightsEvalSummary {
  total: number;
  verified: number;
  potential_hallucination: number;
}

/** Ocena LLM-as-a-Judge dla pojedynczej sugestii */
export interface JudgeReviewItem {
  index: number;
  title: string;
  consistency: "pass" | "warn" | "fail";
  risk: "low" | "medium" | "high";
  consistencyNote: string;
  riskNote: string;
  approved: boolean;
}

export interface JudgeReviewResult {
  model: string;
  reviewedAt: string;
  overall_pass: boolean;
  items: JudgeReviewItem[];
  tokens_used?: number;
}

export type StrategistExpertPersona =
  | "store_manager"
  | "supply_chain_manager"
  | "financial_controller"
  | "regional_logistics_manager";

export interface AiInsightsMeta {
  provider: string;
  productCount: number;
  /** Brak wierszy sprzedaży / produktów do analizy rotacji */
  emptyDataset?: boolean;
  orchestration?: string;
  analystModel?: string;
  strategistModel?: string;
  strategistPersona?: StrategistExpertPersona;
  userInstructionsApplied?: boolean;
  promptVersion?: string;
  sessionId?: string;
  latency_ms?: number;
  total_tokens?: number;
  cost_usd?: number;
  evalSummary?: AiInsightsEvalSummary;
  judge_review?: JudgeReviewResult | null;
  from_cache?: boolean;
  cacheAge_ms?: number;
  partial?: boolean;
  partialReason?: "max_iterations" | "token_limit";
  guardrailMessage?: string;
  current_step?: string;
}

/** Status zadania agentowego (polling) */
export interface AgentInsightsJobStatus {
  sessionId: string;
  status: "running" | "done" | "error";
  current_step: string;
  result?: AiInsightsResponse;
  error?: string;
}

export type SuggestionFeedbackVerdict = "approve" | "reject";

export interface SuggestionFeedbackBody {
  sessionId: string;
  suggestionIndex: number;
  verdict: SuggestionFeedbackVerdict;
  title: string;
  description: string;
  filename?: string;
}

/** GET /api/ai/performance — statystyki agenta */
export interface AiPerformanceStats {
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
}

export interface AiInsightsResponse {
  suggestions: EvaluatedAISuggestion[];
  meta: AiInsightsMeta;
  reactTrace?: ReActTraceStep[];
  analystFacts?: AnalystFactsPayload;
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
  orchestration?: string;
  toolsUsed?: string[];
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
    llmAvailable?: boolean;
    setupHint?: string;
  };
}

/** Przystanek trasy dnia (Sales Route Optimizer) */
export interface RoutePlanStop {
  order: number;
  city: string;
  clientName: string;
  visitGoal: string;
  driveTimeHoursFromPrevious: number;
  driveTimeLabel?: string;
  visitDurationMinutes: number;
  /** Szac. przyjazd przy starcie dnia o 08:00 (HH:MM) */
  arrivalTime?: string;
  /** Dystans od poprzedniego przystanku (km) */
  distanceKmFromPrevious?: number;
  /** Dojazd po 16:00 — poza preferowanym oknem B2B */
  afterBusinessHours?: boolean;
  lat?: number;
  lng?: number;
}

export interface RoutePlanPayload {
  baseCity: string;
  cluster?: string;
  summary?: string;
  stops: RoutePlanStop[];
}

export interface RoutePlanMeta {
  provider: string;
  model?: string;
  orchestration?: string;
  persona?: string;
  route_plan?: RoutePlanPayload;
  /** Ostrzeżenia logistyczne (godziny pracy, skrócenie trasy, powrót do bazy) */
  warnings?: string[];
  /** Dystans pełnej pętli Olsztyn → … → Olsztyn (km) */
  fullLoopKm?: number;
}

/** POST /api/ai/plan-route */
export interface RoutePlanResponse {
  route_plan: RoutePlanPayload;
  total_driving_time: number;
  total_visit_time_hours?: number;
  estimated_fuel_cost: number;
  meta: RoutePlanMeta;
  reactTrace?: ReActTraceStep[];
  guardrail_warnings?: string[];
}
