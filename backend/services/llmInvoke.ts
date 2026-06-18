import OpenAI from "openai";
import {
  canSpend,
  ESTIMATED_USD_PER_LLM_REQUEST,
  recordSpend,
} from "../utils/budgetManager";
import { estimateCostUsd } from "./aiLogger";
import { withRateLimitRetry } from "./llmRetry";
import {
  llmCostUsdTotal,
  llmRequestDuration,
  llmTokensTotal,
  refreshBudgetGauge,
} from "../observability/metrics";

export type LlmProviderActive = "openai" | "anthropic";

const DEFAULT_AI_REQUEST_TIMEOUT_MS = 180_000;

function getAiRequestTimeoutMs(): number {
  const parsed = Number(process.env.AI_REQUEST_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_AI_REQUEST_TIMEOUT_MS;
}

export type LlmConfigStatus = {
  available: boolean;
  provider: "openai" | "anthropic" | "none";
  /** Preferowany z AI_PROVIDER (może być niedostępny bez klucza) */
  configuredProvider?: string;
  hint?: string;
};

/**
 * Wybór dostawcy LLM — spójny z modułami AI.
 * Gdy AI_PROVIDER wskazuje dostawcę bez klucza, używany jest drugi dostępny klucz.
 */
export function chooseProvider(): "openai" | "anthropic" | "none" {
  return getLlmConfigStatus().provider;
}

export function getLlmConfigStatus(): LlmConfigStatus {
  const explicit = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  const hasOpenAi = Boolean(process.env.OPENAI_API_KEY?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  if (explicit === "openai") {
    if (hasOpenAi) return { available: true, provider: "openai", configuredProvider: "openai" };
    if (hasAnthropic) {
      return {
        available: true,
        provider: "anthropic",
        configuredProvider: "openai",
        hint: "AI_PROVIDER=openai, ale brak OPENAI_API_KEY — użyto Anthropic.",
      };
    }
    return {
      available: false,
      provider: "none",
      configuredProvider: "openai",
      hint: "Ustaw OPENAI_API_KEY w backend/.env (lub zmień AI_PROVIDER i dodaj ANTHROPIC_API_KEY).",
    };
  }

  if (explicit === "anthropic") {
    if (hasAnthropic) return { available: true, provider: "anthropic", configuredProvider: "anthropic" };
    if (hasOpenAi) {
      return {
        available: true,
        provider: "openai",
        configuredProvider: "anthropic",
        hint: "AI_PROVIDER=anthropic, ale brak ANTHROPIC_API_KEY — użyto OpenAI.",
      };
    }
    return {
      available: false,
      provider: "none",
      configuredProvider: "anthropic",
      hint: "Ustaw ANTHROPIC_API_KEY w backend/.env (lub zmień AI_PROVIDER=openai i dodaj OPENAI_API_KEY).",
    };
  }

  if (hasOpenAi) return { available: true, provider: "openai" };
  if (hasAnthropic) return { available: true, provider: "anthropic" };
  return {
    available: false,
    provider: "none",
    hint: "Brak klucza LLM. Dodaj OPENAI_API_KEY lub ANTHROPIC_API_KEY w pliku backend/.env i zrestartuj serwer (npm run dev).",
  };
}

export type InvokeLlmJsonOptions = {
  system: string;
  user: string;
  temperature?: number;
  maxTokensOpenAi?: number;
  maxTokensAnthropic?: number;
  /** Nadpisanie modelu (np. gpt-4o-mini / Haiku dla kroku Analityk) */
  modelOverride?: string;
  /** Nadpisanie timeoutu HTTP (ms); domyślnie AI_REQUEST_TIMEOUT_MS */
  timeoutMs?: number;
};

function resolveTimeoutMs(timeoutMs?: number): number {
  const ms = timeoutMs ?? getAiRequestTimeoutMs();
  return Number.isFinite(ms) && ms > 0 ? ms : getAiRequestTimeoutMs();
}

export class LlmBudgetExceededError extends Error {
  readonly remaining: number;

  constructor(remaining: number) {
    super(`Daily AI budget exceeded. Remaining: $${remaining.toFixed(4)}`);
    this.name = "LlmBudgetExceededError";
    this.remaining = remaining;
  }
}

export function isLlmBudgetExceededError(err: unknown): err is LlmBudgetExceededError {
  if (err instanceof LlmBudgetExceededError) return true;
  return (
    err instanceof Error &&
    err.message.includes("Daily AI budget exceeded")
  );
}

/**
 * Wywołanie modelu z oczekiwanym JSON-em w odpowiedzi (OpenAI: response_format json_object).
 * Anthropic: system + user; model proszony o sam JSON w system prompt.
 */
export type LlmInvokeResult = {
  raw: string;
  provider: LlmProviderActive;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
};

function assertBudgetAllowsRequest(): void {
  const budget = canSpend(ESTIMATED_USD_PER_LLM_REQUEST);
  if (!budget.ok) {
    throw new LlmBudgetExceededError(budget.remaining);
  }
}

export type LlmTokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

function recordLlmUsageMetrics(
  provider: LlmProviderActive,
  model: string,
  usage: LlmTokenUsage,
  llmStartMs: number
): void {
  const cost = estimateCostUsd(model, usage);
  recordSpend(cost, `${provider}:${model}`);
  llmTokensTotal.inc({ provider, model, type: "input" }, usage.prompt_tokens);
  llmTokensTotal.inc({ provider, model, type: "output" }, usage.completion_tokens);
  llmCostUsdTotal.inc({ provider, model }, cost);
  llmRequestDuration.observe({ provider, model }, (Date.now() - llmStartMs) / 1000);
  refreshBudgetGauge();
}

function createOpenAiClient(apiKey: string, timeoutMs: number): OpenAI {
  return new OpenAI({
    apiKey,
    timeout: timeoutMs,
    maxRetries: 1,
  });
}

async function invokeOpenAiJson(
  options: InvokeLlmJsonOptions
): Promise<LlmInvokeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("MISSING_OPENAI");

  assertBudgetAllowsRequest();

  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const client = createOpenAiClient(apiKey, timeoutMs);
  const model = options.modelOverride || process.env.AI_MODEL || "gpt-4o";

  const llmStart = Date.now();
  const res = await withRateLimitRetry(() =>
    client.chat.completions.create({
      model,
      temperature: options.temperature ?? 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      max_tokens: options.maxTokensOpenAi ?? 4096,
    })
  );

  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("Empty OpenAI response");

  const u = res.usage;
  const usage: LlmTokenUsage = {
    prompt_tokens: u?.prompt_tokens ?? 0,
    completion_tokens: u?.completion_tokens ?? 0,
    total_tokens: u?.total_tokens ?? 0,
  };

  recordLlmUsageMetrics("openai", model, usage, llmStart);

  return {
    raw: text,
    provider: "openai",
    model,
    usage,
  };
}

async function invokeAnthropicJson(
  options: InvokeLlmJsonOptions
): Promise<LlmInvokeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("MISSING_ANTHROPIC");

  const model =
    options.modelOverride ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-4-6";

  assertBudgetAllowsRequest();

  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const llmStart = Date.now();
  try {
    const res = await withRateLimitRetry(() =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokensAnthropic ?? 4096,
          system: `${options.system}\n\nOdpowiedz WYŁĄCZNIE jednym obiektem JSON (bez markdown, bez komentarzy przed/po).`,
          messages: [{ role: "user", content: options.user }],
        }),
        signal: controller.signal,
      })
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 500)}`);
    }

    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = body.content?.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Empty Anthropic response");

    const inTok = body.usage?.input_tokens ?? 0;
    const outTok = body.usage?.output_tokens ?? 0;
    const usage: LlmTokenUsage = {
      prompt_tokens: inTok,
      completion_tokens: outTok,
      total_tokens: inTok + outTok,
    };

    recordLlmUsageMetrics("anthropic", model, usage, llmStart);

    return {
      raw: text,
      provider: "anthropic",
      model,
      usage,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Anthropic request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function invokeLlmJsonObject(
  options: InvokeLlmJsonOptions
): Promise<LlmInvokeResult> {
  const provider = chooseProvider();
  if (provider === "none") {
    throw new Error("NO_LLM_PROVIDER");
  }

  if (provider === "openai") {
    return invokeOpenAiJson(options);
  }
  return invokeAnthropicJson(options);
}

/** Bloki treści w API Anthropic (messages + tools). */
export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type AnthropicChatMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

export type AnthropicToolDefinition = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

export type OpenAiChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export type InvokeOpenAiChatOptions = {
  messages: OpenAiChatMessage[];
  tools?: OpenAI.Chat.ChatCompletionTool[];
  tool_choice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
  model?: string;
  temperature?: number;
  max_tokens?: number;
  timeoutMs?: number;
};

export type OpenAiChatRoundResult = {
  provider: "openai";
  model: string;
  usage: LlmTokenUsage;
  message: OpenAI.Chat.ChatCompletionMessage;
};

export type InvokeAnthropicChatOptions = {
  system: string;
  messages: AnthropicChatMessage[];
  tools?: AnthropicToolDefinition[];
  model?: string;
  max_tokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

export type AnthropicChatRoundResult = {
  provider: "anthropic";
  model: string;
  usage: LlmTokenUsage;
  content: AnthropicContentBlock[];
  stop_reason?: string;
};

/**
 * Jedna runda OpenAI Chat Completions z opcjonalnym function calling (ReAct / route planner).
 */
export async function invokeOpenAiChatRound(
  options: InvokeOpenAiChatOptions
): Promise<OpenAiChatRoundResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("MISSING_OPENAI");

  assertBudgetAllowsRequest();

  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const client = createOpenAiClient(apiKey, timeoutMs);
  const model = options.model ?? process.env.AI_MODEL ?? "gpt-4o";
  const llmStart = Date.now();

  const res = await withRateLimitRetry(() =>
    client.chat.completions.create({
      model,
      temperature: options.temperature ?? 0.3,
      messages: options.messages,
      tools: options.tools,
      tool_choice: options.tool_choice ?? (options.tools?.length ? "auto" : undefined),
      max_tokens: options.max_tokens,
    })
  );

  const message = res.choices[0]?.message;
  if (!message) throw new Error("Empty OpenAI response");

  const u = res.usage;
  const usage: LlmTokenUsage = {
    prompt_tokens: u?.prompt_tokens ?? 0,
    completion_tokens: u?.completion_tokens ?? 0,
    total_tokens: u?.total_tokens ?? 0,
  };
  recordLlmUsageMetrics("openai", model, usage, llmStart);

  return { provider: "openai", model, usage, message };
}

/**
 * Jedna runda Anthropic Messages API z opcjonalnym tool use (ReAct).
 */
export async function invokeAnthropicChatRound(
  options: InvokeAnthropicChatOptions
): Promise<AnthropicChatRoundResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("MISSING_ANTHROPIC");

  const model =
    options.model ??
    process.env.ANTHROPIC_MODEL ??
    process.env.AI_STRATEGIST_MODEL ??
    "claude-sonnet-4-6";

  assertBudgetAllowsRequest();

  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const llmStart = Date.now();

  try {
    const res = await withRateLimitRetry(() =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: options.max_tokens ?? 4096,
          temperature: options.temperature,
          system: options.system,
          tools: options.tools,
          messages: options.messages,
        }),
        signal: controller.signal,
      })
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 500)}`);
    }

    const body = (await res.json()) as {
      content?: AnthropicContentBlock[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const inTok = body.usage?.input_tokens ?? 0;
    const outTok = body.usage?.output_tokens ?? 0;
    const usage: LlmTokenUsage = {
      prompt_tokens: inTok,
      completion_tokens: outTok,
      total_tokens: inTok + outTok,
    };
    recordLlmUsageMetrics("anthropic", model, usage, llmStart);

    return {
      provider: "anthropic",
      model,
      usage,
      content: body.content ?? [],
      stop_reason: body.stop_reason,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Anthropic request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
