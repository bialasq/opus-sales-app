import axios, { type AxiosInstance, isAxiosError } from "axios";
import { ElMessage } from "element-plus";
import type {
  AgentInsightsJobStatus,
  AiPerformanceStats,
  AiInsightsLegacyResponse,
  AiInsightsResponse,
  AnalyticsSummary,
  SuggestionFeedbackBody,
  CustomerProfilesResponse,
  PaymentOverdueRecord,
  ProductAnalysisResponse,
  SendReminderResponse,
  TestDataInfoResponse,
  UploadResponse,
  VisitPlanResponse,
  RoutePlanResponse,
} from "@shared/api-types";

/**
 * Bazowy URL API (Vue CLI: VUE_APP_API_URL).
 * Pusty = względne "/api" + proxy devServer.
 * Jeśli podasz sam host (np. http://127.0.0.1:3000), dopinamy /api — inaczej axios woła złe ścieżki (404).
 */
type RuntimeAppConfig = {
  API_URL?: string;
  API_KEY?: string;
  SENTRY_DSN?: string;
};

function runtimeConfig(): RuntimeAppConfig {
  if (typeof window !== "undefined") {
    const cfg = (window as Window & { __APP_CONFIG__?: RuntimeAppConfig })
      .__APP_CONFIG__;
    if (cfg) return cfg;
  }
  return {};
}

function getApiRoot(): string {
  const runtime = runtimeConfig().API_URL?.trim();
  if (runtime && runtime !== "__API_URL__") {
    return runtime.replace(/\/$/, "");
  }
  const vue = process.env.VUE_APP_API_URL;
  if (!vue || !String(vue).trim()) {
    return "/api";
  }
  let base = String(vue).trim().replace(/\/$/, "");
  if (!/\/api(\/|$)/i.test(base)) {
    try {
      const u = new URL(base);
      const p = (u.pathname || "").replace(/\/$/, "") || "/";
      if (p === "/") {
        base = `${base}/api`;
      }
    } catch {
      if (!base.endsWith("/api")) {
        base = `${base}/api`;
      }
    }
  }
  return base.replace(/\/$/, "");
}

export const API_ROOT = getApiRoot();

/** Nagłówek API key (VUE_APP_API_KEY) — wspólny dla axios i el-upload. */
export function getApiKeyHeaders(): Record<string, string> {
  const runtimeKey = runtimeConfig().API_KEY?.trim();
  const key =
    (runtimeKey && runtimeKey !== "__API_KEY__" ? runtimeKey : "") ||
    process.env.VUE_APP_API_KEY?.trim() ||
    "";
  if (!key) return {};
  return { "x-api-key": key };
}

/** Długie wywołania agenta (ReAct + Judge) */
export const AGENT_REQUEST_TIMEOUT_MS = 60_000;

export function uploadActionUrl(): string {
  return `${API_ROOT}/upload`;
}

export function testDataDownloadUrl(): string {
  return `${API_ROOT}/test-data/download`;
}

const client: AxiosInstance = axios.create({
  baseURL: API_ROOT,
  headers: {
    "Content-Type": "application/json",
    ...getApiKeyHeaders(),
  },
});

function formatZodFlatten(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  const d = details as {
    formErrors?: string[];
    fieldErrors?: Record<string, string[]>;
  };
  const parts: string[] = [];
  if (Array.isArray(d.formErrors) && d.formErrors.length) {
    parts.push(...d.formErrors);
  }
  if (d.fieldErrors && typeof d.fieldErrors === "object") {
    for (const [key, msgs] of Object.entries(d.fieldErrors)) {
      if (Array.isArray(msgs) && msgs.length) {
        parts.push(`${key}: ${msgs.join(", ")}`);
      }
    }
  }
  return parts.join(" · ");
}

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (!isAxiosError(error) || !error.response) {
      return Promise.reject(error);
    }
    const { status, data } = error.response;
    if (status === 400 && typeof data === "object" && data !== null) {
      const body = data as { error?: string; details?: unknown };
      const detailText = formatZodFlatten(body.details);
      const headline = body.error || "Niepoprawne dane";
      ElMessage.warning({
        message: detailText ? `${headline}. ${detailText}` : headline,
        duration: 9000,
        showClose: true,
        grouping: true,
      });
    }
    return Promise.reject(error);
  }
);

export async function getAiInsights(
  filename: string,
  userInstructions?: string
): Promise<AiInsightsResponse> {
  const { data } = await client.get<AiInsightsResponse>("/ai/insights", {
    params: {
      filename,
      ...(userInstructions?.trim() ? { userInstructions: userInstructions.trim() } : {}),
    },
    timeout: AGENT_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export async function runAiInsightsJob(
  filename: string,
  userInstructions?: string
): Promise<{ sessionId: string; status: string; current_step: string }> {
  const trimmed = userInstructions?.trim();
  const { data } = await client.post<{ sessionId: string; status: string; current_step: string }>(
    "/ai/insights/run",
    {
      filename,
      ...(trimmed ? { userInstructions: trimmed } : {}),
    },
    { timeout: AGENT_REQUEST_TIMEOUT_MS }
  );
  return data;
}

export async function pollAiInsightsJob(
  sessionId: string
): Promise<AgentInsightsJobStatus> {
  const { data } = await client.get<AgentInsightsJobStatus>(
    `/ai/insights/job/${sessionId}`,
    { timeout: AGENT_REQUEST_TIMEOUT_MS }
  );
  return data;
}

export async function postSuggestionFeedback(
  body: SuggestionFeedbackBody
): Promise<{ ok: boolean }> {
  const { data } = await client.post<{ ok: boolean }>("/ai/insights/feedback", body);
  return data;
}

export async function getAiPerformance(): Promise<AiPerformanceStats> {
  const { data } = await client.get<AiPerformanceStats>("/ai/performance");
  return data;
}

export async function clearAiCache(): Promise<{ ok: boolean; cleared: number }> {
  const { data } = await client.post<{ ok: boolean; cleared: number }>("/ai/cache/clear");
  return data;
}

export async function getTestDataInfo(): Promise<TestDataInfoResponse> {
  const { data } = await client.get<TestDataInfoResponse>(
    "/analytics/test-data-info"
  );
  return data;
}

export type LlmStatusResponse = {
  available: boolean;
  provider: "openai" | "anthropic" | "none";
  configuredProvider?: string;
  hint?: string;
  hasOpenAiKey?: boolean;
  hasAnthropicKey?: boolean;
};

export async function getLlmStatus(): Promise<LlmStatusResponse> {
  const { data } = await client.get<LlmStatusResponse>("/admin/llm-status");
  return data;
}

export async function postDashboard(
  filename: string
): Promise<AnalyticsSummary> {
  const { data } = await client.post<AnalyticsSummary>("/analytics/dashboard", {
    filename,
  });
  return data;
}

export async function postProductAnalysis(
  filename: string
): Promise<ProductAnalysisResponse> {
  const { data } = await client.post<ProductAnalysisResponse>(
    "/products/analysis",
    { filename }
  );
  return data;
}

export async function postCustomerProfile(
  filename: string
): Promise<CustomerProfilesResponse> {
  const { data } = await client.post<CustomerProfilesResponse>(
    "/customers/profile",
    { filename }
  );
  return data;
}

export async function postVisitPlan(
  profiles: Record<string, unknown>
): Promise<VisitPlanResponse> {
  const { data } = await client.post<VisitPlanResponse>(
    "/customers/visit-plan",
    { profiles }
  );
  return data;
}

export async function postPaymentsOverdue(): Promise<PaymentOverdueRecord[]> {
  const { data } = await client.post<PaymentOverdueRecord[]>(
    "/payments/overdue",
    {}
  );
  return data;
}

export async function postSendReminder(
  body: Record<string, unknown>
): Promise<SendReminderResponse> {
  const { data } = await client.post<SendReminderResponse>(
    "/payments/send-reminder",
    body
  );
  return data;
}

export async function planSalesRoute(
  filename: string,
  userInstructions?: string
): Promise<RoutePlanResponse> {
  const trimmed = userInstructions?.trim();
  const { data } = await client.post<RoutePlanResponse>(
    "/ai/plan-route",
    {
      filename,
      ...(trimmed ? { userInstructions: trimmed } : {}),
    },
    { timeout: AGENT_REQUEST_TIMEOUT_MS }
  );
  return data;
}

export async function postAiInsightsLegacy(body: {
  data: unknown;
  agentType: string;
}): Promise<AiInsightsLegacyResponse> {
  const { data } = await client.post<AiInsightsLegacyResponse>(
    "/analytics/ai-insights",
    body
  );
  return data;
}

export default client;
