import type {
  CombinedMetrics,
  PaymentAnalysis,
  SalesAnalysis,
  VisitAnalysis,
} from "./excelTypes";

export interface ReportFileResult {
  filename: string;
  path: string;
  url: string;
}

export interface AiRecommendation {
  title: string;
  description: string;
  action?: string;
}

export interface ReportAnalysisPayload {
  visitAnalysis?: VisitAnalysis | null;
  salesAnalysis?: SalesAnalysis | null;
  paymentAnalysis?: PaymentAnalysis | null;
  metrics?: CombinedMetrics | null;
  aiRecommendations?: AiRecommendation[];
}
