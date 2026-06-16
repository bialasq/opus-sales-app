import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";
import { getBudgetStatus } from "../utils/budgetManager";

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const llmTokensTotal = new Counter({
  name: "llm_tokens_total",
  help: "Total LLM tokens consumed",
  labelNames: ["provider", "model", "type"],
  registers: [registry],
});

export const llmCostUsdTotal = new Counter({
  name: "llm_cost_usd_total",
  help: "Total LLM cost in USD",
  labelNames: ["provider", "model"],
  registers: [registry],
});

export const llmRequestDuration = new Histogram({
  name: "llm_request_duration_seconds",
  help: "LLM API request duration in seconds",
  labelNames: ["provider", "model"],
  buckets: [0.5, 1, 2, 5, 10, 30, 60],
  registers: [registry],
});

export const agentIterationsTotal = new Counter({
  name: "agent_iterations_total",
  help: "Total agent ReAct iterations",
  labelNames: ["agent_role"],
  registers: [registry],
});

export const budgetRemainingUsd = new Gauge({
  name: "budget_remaining_usd",
  help: "Remaining daily AI budget in USD",
  registers: [registry],
});

export function refreshBudgetGauge(): void {
  budgetRemainingUsd.set(getBudgetStatus().remainingUsd);
}
