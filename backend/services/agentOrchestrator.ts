import OpenAI from "openai";
import type {
  AISuggestion,
  AnalyticsAgentInsightsResponse,
  ReActTraceStep,
  StrategistExpertPersona,
} from "../shared/api-types";
import {
  type SalesWorkbookContext,
  executeAgentTool,
  toolsToOpenAIFormat,
} from "./aiAgentTools";
import {
  getActivePromptVersion,
  ANALYST_SYSTEM_PROMPT,
  STRATEGIST_RETRY_HINT,
  STRATEGIST_SYSTEM_PROMPT,
  STRATEGIST_USER_PREFIX,
  STRATEGIST_PERSONA_SUPPLY_CHAIN,
  STRATEGIST_PERSONA_FINANCIAL,
  STRATEGIST_PERSONA_LOGISTICS,
  appendUserConstraint,
} from "../prompts";
import { createLogger } from "./appLogger";
import {
  MAX_ITERATIONS,
  SESSION_TOKEN_LIMIT,
  buildPartialSuggestions,
  GUARDRAIL_MESSAGES,
  isMaxIterationsReached,
  isTokenLimitExceeded,
  shouldStopForToolBudget,
  type GuardrailStopReason,
} from "./agentGuardrails";
import { withRateLimitRetry } from "./llmRetry";
import {
  createSessionId,
  emptyUsage,
  estimateCostUsd,
  mergeUsage,
  type TokenUsage,
  usageFromAnthropic,
  usageFromOpenAI,
} from "./aiLogger";
import { buildStrategistKnowledgeContext } from "./knowledgeService";
import { chooseProvider, invokeLlmJsonObject } from "./llmInvoke";

const log = createLogger("agentOrchestrator");

export type StrategistRunContext = {
  persona: StrategistExpertPersona;
  userInstructions?: string;
};

function personaLabel(persona: StrategistExpertPersona): string {
  if (persona === "financial_controller") return "Financial Controller";
  if (persona === "supply_chain_manager") return "Supply Chain Manager";
  if (persona === "regional_logistics_manager") return "Regional Logistics Manager";
  return "Store Manager";
}

/** Routing persony Stratega na podstawie faktów Analityka */
export function resolveExpertPersona(facts: AnalystFacts): StrategistExpertPersona {
  const blob = `${facts.summary} ${(facts.anomalies || []).join(" ")}`.toLowerCase();
  const paymentKw = ["płatno", "należno", "zaleg", "faktur", "marż", "finans", "przychód"];
  const supplyKw = ["magazyn", "brak", "rotac", "domów", "zalegan", "stockout", "overstock", "zapas"];
  const logisticsKw = ["trasa", "wizyt", "olsztyn", "logistyk", "dojazd", "region", "warmińsk"];

  let paymentScore = 0;
  let supplyScore = 0;
  let logisticsScore = 0;
  for (const k of paymentKw) {
    if (blob.includes(k)) paymentScore += 1;
  }
  for (const k of supplyKw) {
    if (blob.includes(k)) supplyScore += 1;
  }
  for (const k of logisticsKw) {
    if (blob.includes(k)) logisticsScore += 1;
  }

  const alerts = facts.toolSnapshots?.getLowStockAlerts as
    | { stockoutRisk?: unknown[]; overstock?: unknown[] }
    | undefined;
  if (alerts?.stockoutRisk?.length) supplyScore += 2;
  if (alerts?.overstock?.length) supplyScore += 2;

  if (logisticsScore >= 2 && logisticsScore >= paymentScore && logisticsScore >= supplyScore) {
    return "regional_logistics_manager";
  }
  if (paymentScore > supplyScore && paymentScore >= 2) return "financial_controller";
  if (supplyScore > paymentScore && supplyScore >= 2) return "supply_chain_manager";
  return "store_manager";
}

function strategistSystemPrompt(
  ctx: SalesWorkbookContext,
  persona: StrategistExpertPersona
): string {
  const productNames = ctx.getProducts().map((p) => p.name);
  let personaBlock = "";
  if (persona === "supply_chain_manager") personaBlock = STRATEGIST_PERSONA_SUPPLY_CHAIN;
  else if (persona === "financial_controller") personaBlock = STRATEGIST_PERSONA_FINANCIAL;
  else if (persona === "regional_logistics_manager") personaBlock = STRATEGIST_PERSONA_LOGISTICS;

  return (
    STRATEGIST_SYSTEM_PROMPT +
    personaBlock +
    buildStrategistKnowledgeContext(ctx.filename, productNames)
  );
}

function buildStrategistUserContent(
  filename: string,
  analystFacts: AnalystFacts,
  productCount: number,
  userInstructions?: string
): string {
  const base = STRATEGIST_USER_PREFIX(
    filename,
    JSON.stringify(analystFacts),
    productCount
  );
  return appendUserConstraint(base, userInstructions);
}

export type ReActStep = ReActTraceStep;

export type AnalystFacts = {
  summary: string;
  anomalies: string[];
  metrics: Record<string, unknown>;
  toolSnapshots?: Record<string, unknown>;
};

export type AgenticInsightsResult = {
  suggestions: AISuggestion[];
  reactTrace: ReActStep[];
  analystFacts: AnalystFacts | null;
  sessionId: string;
  latency_ms: number;
  total_tokens: number;
  cost_usd: number;
  promptVersion: string;
  meta: {
    provider: string;
    productCount: number;
    analystModel?: string;
    strategistModel?: string;
    orchestration: string;
    partial?: boolean;
    partialReason?: GuardrailStopReason;
    guardrailMessage?: string;
    strategistPersona?: StrategistExpertPersona;
    userInstructionsApplied?: boolean;
  };
};

export type WorkflowHooks = {
  onStep?: (step: string) => void;
};

export type AgenticWorkflowOptions = {
  hooks?: WorkflowHooks;
  /** Opcjonalne wytyczne użytkownika (Direct User Constraint) */
  userInstructions?: string;
};

function emitStep(hooks: WorkflowHooks | undefined, step: string): void {
  hooks?.onStep?.(step);
}

function llmErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Gdy model Analityka (mini) zawiedzie — Strateg dostaje jawny sygnał + snapshot narzędzi. */
async function buildAnalystUnavailableFacts(
  ctx: SalesWorkbookContext,
  productCount: number,
  err: unknown
): Promise<AnalystFacts> {
  const msg = llmErrorMessage(err).slice(0, 240);
  let alerts: unknown;
  try {
    alerts = await executeAgentTool(ctx, "getLowStockAlerts", {
      rotationThreshold: 0.35,
    });
  } catch {
    alerts = undefined;
  }
  const top = ctx.getProducts().slice(0, 5);
  return {
    summary:
      "Analiza wstępna niedostępna — działaj na surowych danych z narzędzi i kontekstu pliku.",
    anomalies: [`Krok Analityka nie powiódł się: ${msg}`],
    metrics: {
      productCount,
      analystSkipped: true,
      topProductNames: top.map((p) => p.name),
    },
    toolSnapshots: alerts ? { getLowStockAlerts: alerts } : undefined,
  };
}

function fallbackInsightsFromTrace(reactTrace: ReActStep[]): string {
  const last = [...reactTrace].reverse().find((s) => s.observation);
  if (last?.observation) {
    return `Analiza częściowa (limit iteracji). Ostatnie narzędzie ${last.action}: ${String(last.observation).slice(0, 1200)}`;
  }
  return "Analiza zakończona po osiągnięciu limitu iteracji — odśwież zapytanie lub zawęź zakres.";
}

function getAnalystModel(provider: "openai" | "anthropic"): string {
  if (provider === "openai") {
    return process.env.AI_ANALYST_MODEL || "gpt-4o-mini";
  }
  return process.env.AI_ANALYST_MODEL || "claude-haiku-4-5-20251001";
}

function getStrategistModel(provider: "openai" | "anthropic"): string {
  if (provider === "openai") {
    return process.env.AI_STRATEGIST_MODEL || process.env.AI_MODEL || "gpt-4o";
  }
  return (
    process.env.AI_STRATEGIST_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-4-6"
  );
}

function stripJsonFences(raw: string): string {
  return raw.replace(/```json\n?|\n?```/g, "").trim();
}

function parseSuggestions(raw: string): AISuggestion[] {
  const cleaned = stripJsonFences(raw);
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

function parseAnalystFacts(raw: string): AnalystFacts | null {
  try {
    const p = JSON.parse(stripJsonFences(raw)) as AnalystFacts;
    if (typeof p.summary === "string" && Array.isArray(p.anomalies)) {
      return p;
    }
  } catch {
    return null;
  }
  return null;
}

function parseReActFromStrategistPayload(payload: {
  reactTrace?: ReActStep[];
  suggestions?: Partial<AISuggestion>[];
}): { trace: ReActStep[]; suggestions: AISuggestion[] } {
  const trace = Array.isArray(payload.reactTrace) ? payload.reactTrace : [];
  const suggestions = (payload.suggestions || [])
    .filter(
      (s): s is AISuggestion =>
        typeof s?.title === "string" &&
        typeof s?.description === "string" &&
        (s.priority === "high" ||
          s.priority === "medium" ||
          s.priority === "low")
    )
    .slice(0, 12);
  return { trace, suggestions };
}

/**
 * Krok 1 — Analityk (tańszy model): surowe fakty + anomalie bez pełnego JSON produktów.
 */
export async function runAnalystPass(
  ctx: SalesWorkbookContext,
  productCount: number,
  usageAcc: TokenUsage = emptyUsage(),
  hooks?: WorkflowHooks
): Promise<{
  facts: AnalystFacts;
  provider: string;
  model: string;
  usage: TokenUsage;
}> {
  const provider = chooseProvider();
  if (provider === "none") {
    throw new Error("NO_LLM_PROVIDER");
  }

  emitStep(hooks, "Analityk bada dane…");
  const top = ctx.getProducts().slice(0, 5);
  emitStep(hooks, "Wywołuję: getLowStockAlerts…");
  const alerts = await executeAgentTool(ctx, "getLowStockAlerts", {
    rotationThreshold: 0.35,
  });

  const user = JSON.stringify({
    productCount,
    sampleTopProducts: top,
    lowStockAlerts: alerts,
  });

  const analystModel = getAnalystModel(provider);
  const { raw, usage } = await invokeLlmJsonObject({
    system: ANALYST_SYSTEM_PROMPT,
    user,
    temperature: 0.2,
    modelOverride: analystModel,
  });
  const mergedUsage = mergeUsage(usageAcc, usage);

  const facts =
    parseAnalystFacts(raw) ?? {
      summary: `Przeanalizowano ${productCount} produktów w pliku ${ctx.filename}.`,
      anomalies: ["Brak sparsowanych faktów z modelu — użyto snapshotu narzędzi"],
      metrics: { productCount },
      toolSnapshots: { getLowStockAlerts: alerts },
    };

  facts.toolSnapshots = { getLowStockAlerts: alerts };

  if (top.length) {
    facts.metrics = {
      ...(facts.metrics || {}),
      topProductNames: top.map((p) => p.name),
    };
  }

  return {
    facts,
    provider,
    model: analystModel,
    usage: mergedUsage,
  };
}

type OpenAIMessage =
  | OpenAI.Chat.ChatCompletionMessageParam
  | OpenAI.Chat.ChatCompletionToolMessageParam;

/**
 * Pętla ReAct + function calling (OpenAI).
 */
async function runStrategistReActOpenAI(
  ctx: SalesWorkbookContext,
  analystFacts: AnalystFacts,
  productCount: number,
  usageAcc: TokenUsage,
  sessionId: string,
  workflowStart: number,
  strategistCtx: StrategistRunContext,
  hooks?: WorkflowHooks
): Promise<AgenticInsightsResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("MISSING_OPENAI");
  const client = new OpenAI({ apiKey });
  const model = getStrategistModel("openai");
  const tools = toolsToOpenAIFormat();
  const reactTrace: ReActStep[] = [];

  let usage = { ...usageAcc };
  emitStep(hooks, "Strateg wybiera narzędzia…");
  const messages: OpenAIMessage[] = [
    { role: "system", content: strategistSystemPrompt(ctx, strategistCtx.persona) },
    {
      role: "user",
      content: buildStrategistUserContent(
        ctx.filename,
        analystFacts,
        productCount,
        strategistCtx.userInstructions
      ),
    },
  ];

  for (let round = 0; round < MAX_ITERATIONS; round++) {
    if (isTokenLimitExceeded(usage)) {
      return buildPartialAgenticResult({
        reactTrace,
        analystFacts,
        provider: "openai",
        productCount,
        analystModel: getAnalystModel("openai"),
        strategistModel: model,
        sessionId,
        workflowStart,
        analystUsage: usageAcc,
        usage,
        reason: "token_limit",
      });
    }

    if (shouldStopForToolBudget(reactTrace)) {
      return buildPartialAgenticResult({
        reactTrace,
        analystFacts,
        provider: "openai",
        productCount,
        analystModel: getAnalystModel("openai"),
        strategistModel: model,
        sessionId,
        workflowStart,
        analystUsage: usageAcc,
        usage,
        reason: "max_iterations",
      });
    }

    let res: OpenAI.Chat.ChatCompletion;
    try {
      res = await withRateLimitRetry(() =>
        client.chat.completions.create({
          model,
          temperature: 0.3,
          tools,
          tool_choice: "auto",
          messages,
        })
      );
    } catch (e) {
      log.error("Strateg OpenAI LLM error", e);
      return buildPartialAgenticResult({
        reactTrace,
        analystFacts,
        provider: "openai",
        productCount,
        analystModel: getAnalystModel("openai"),
        strategistModel: model,
        sessionId,
        workflowStart,
        analystUsage: usageAcc,
        usage,
        reason: "max_iterations",
      });
    }
    usage = mergeUsage(usage, usageFromOpenAI(res.usage));

    const msg = res.choices[0]?.message;
    if (!msg) break;

    if (msg.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      });

      for (const tc of msg.tool_calls) {
        const fn = tc.function;
        const toolName = fn?.name?.trim() || "";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fn?.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = { _parseError: "invalid_json_arguments" };
        }

        const thought =
          msg.content?.trim() ||
          `Runda ${round + 1}: wywołanie ${toolName || "?"} aby uzupełnić kontekst.`;

        emitStep(hooks, `Wywołuję: ${toolName || "?"}…`);
        const result = toolName
          ? await executeAgentTool(ctx, toolName, args)
          : { error: "Brak nazwy narzędzia w tool_call" };
        const observation = JSON.stringify(result).slice(0, 4000);

        reactTrace.push({
          thought,
          action: toolName || "unknown_tool",
          actionInput: args,
          observation,
        });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: observation,
        });
      }
      if (isMaxIterationsReached(round) || shouldStopForToolBudget(reactTrace)) {
        return buildPartialAgenticResult({
          reactTrace,
          analystFacts,
          provider: "openai",
          productCount,
          analystModel: getAnalystModel("openai"),
          strategistModel: model,
          sessionId,
          workflowStart,
          analystUsage: usageAcc,
          usage,
          reason: "max_iterations",
        });
      }
      continue;
    }

    const text = msg.content?.trim();
    if (text) {
      try {
        const payload = JSON.parse(stripJsonFences(text)) as {
          reactTrace?: ReActStep[];
          suggestions?: Partial<AISuggestion>[];
        };
        const { trace, suggestions } = parseReActFromStrategistPayload(payload);
        return buildAgenticResult({
          suggestions,
          reactTrace: trace.length ? trace : reactTrace,
          analystFacts,
          provider: "openai",
          productCount,
          analystModel: getAnalystModel("openai"),
          strategistModel: model,
          sessionId,
          workflowStart,
          analystUsage: usageAcc,
          usage,
        });
      } catch {
        messages.push({
          role: "assistant",
          content: text,
        });
        messages.push({
          role: "user",
          content: STRATEGIST_RETRY_HINT,
        });
      }
    }
  }

  return buildPartialAgenticResult({
    reactTrace,
    analystFacts,
    provider: "openai",
    productCount,
    analystModel: getAnalystModel("openai"),
    strategistModel: model,
    sessionId,
    workflowStart,
    analystUsage: usageAcc,
    usage,
    reason: "max_iterations",
  });
}

/**
 * Strateg z function calling (Anthropic) lub JSON ReAct (fallback).
 */
function strategistOnlyUsage(total: TokenUsage, analyst: TokenUsage): TokenUsage {
  return {
    prompt_tokens: Math.max(0, total.prompt_tokens - analyst.prompt_tokens),
    completion_tokens: Math.max(0, total.completion_tokens - analyst.completion_tokens),
    total_tokens: Math.max(0, total.total_tokens - analyst.total_tokens),
  };
}

function buildPartialAgenticResult(args: {
  reactTrace: ReActStep[];
  analystFacts: AnalystFacts;
  provider: string;
  productCount: number;
  analystModel: string;
  strategistModel: string;
  sessionId: string;
  workflowStart: number;
  analystUsage: TokenUsage;
  usage: TokenUsage;
  reason: GuardrailStopReason;
}): AgenticInsightsResult {
  const base = buildAgenticResult({
    suggestions: buildPartialSuggestions(args.reactTrace, args.analystFacts),
    reactTrace: args.reactTrace,
    analystFacts: args.analystFacts,
    provider: args.provider,
    productCount: args.productCount,
    analystModel: args.analystModel,
    strategistModel: args.strategistModel,
    sessionId: args.sessionId,
    workflowStart: args.workflowStart,
    analystUsage: args.analystUsage,
    usage: args.usage,
  });
  base.meta.partial = true;
  base.meta.partialReason = args.reason;
  base.meta.guardrailMessage = GUARDRAIL_MESSAGES[args.reason];
  base.meta.orchestration = "analyst-react-tools-strategist-partial";
  return base;
}

function buildAgenticResult(args: {
  suggestions: AISuggestion[];
  reactTrace: ReActStep[];
  analystFacts: AnalystFacts;
  provider: string;
  productCount: number;
  analystModel: string;
  strategistModel: string;
  sessionId: string;
  workflowStart: number;
  analystUsage: TokenUsage;
  usage: TokenUsage;
}): AgenticInsightsResult {
  const stratUsage = strategistOnlyUsage(args.usage, args.analystUsage);
  const cost =
    estimateCostUsd(args.analystModel, args.analystUsage) +
    estimateCostUsd(args.strategistModel, stratUsage);
  return {
    suggestions: args.suggestions,
    reactTrace: args.reactTrace,
    analystFacts: args.analystFacts,
    sessionId: args.sessionId,
    latency_ms: Date.now() - args.workflowStart,
    total_tokens: args.usage.total_tokens,
    cost_usd: cost,
    promptVersion: getActivePromptVersion(),
    meta: {
      provider: args.provider,
      productCount: args.productCount,
      analystModel: args.analystModel,
      strategistModel: args.strategistModel,
      orchestration: "analyst-react-tools-strategist",
    },
  };
}

async function runStrategistReActAnthropic(
  ctx: SalesWorkbookContext,
  analystFacts: AnalystFacts,
  productCount: number,
  usageAcc: TokenUsage,
  sessionId: string,
  workflowStart: number,
  strategistCtx: StrategistRunContext,
  hooks?: WorkflowHooks
): Promise<AgenticInsightsResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("MISSING_ANTHROPIC");
  const model = getStrategistModel("anthropic");
  const reactTrace: ReActStep[] = [];

  const toolDefs = toolsToOpenAIFormat().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  type AnthropicMessage = {
    role: "user" | "assistant";
    content: string | AnthropicContentBlock[];
  };

  type AnthropicContentBlock =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string };

  let usage = { ...usageAcc };
  emitStep(hooks, "Strateg wybiera narzędzia…");
  const messages: AnthropicMessage[] = [
    {
      role: "user",
      content: buildStrategistUserContent(
        ctx.filename,
        analystFacts,
        productCount,
        strategistCtx.userInstructions
      ),
    },
  ];

  for (let round = 0; round < MAX_ITERATIONS; round++) {
    if (isTokenLimitExceeded(usage)) {
      return buildPartialAgenticResult({
        reactTrace,
        analystFacts,
        provider: "anthropic",
        productCount,
        analystModel: getAnalystModel("anthropic"),
        strategistModel: model,
        sessionId,
        workflowStart,
        analystUsage: usageAcc,
        usage,
        reason: "token_limit",
      });
    }

    if (shouldStopForToolBudget(reactTrace)) {
      return buildPartialAgenticResult({
        reactTrace,
        analystFacts,
        provider: "anthropic",
        productCount,
        analystModel: getAnalystModel("anthropic"),
        strategistModel: model,
        sessionId,
        workflowStart,
        analystUsage: usageAcc,
        usage,
        reason: "max_iterations",
      });
    }

    let res: Response;
    try {
      res = await withRateLimitRetry(() =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: strategistSystemPrompt(ctx, strategistCtx.persona),
          tools: toolDefs,
          messages,
        }),
      })
    );
    } catch (e) {
      log.error("Strateg Anthropic LLM error", e);
      return buildPartialAgenticResult({
        reactTrace,
        analystFacts,
        provider: "anthropic",
        productCount,
        analystModel: getAnalystModel("anthropic"),
        strategistModel: model,
        sessionId,
        workflowStart,
        analystUsage: usageAcc,
        usage,
        reason: "max_iterations",
      });
    }

    if (!res.ok) {
      log.error(`Anthropic HTTP ${res.status}`, (await res.text()).slice(0, 400));
      return buildPartialAgenticResult({
        reactTrace,
        analystFacts,
        provider: "anthropic",
        productCount,
        analystModel: getAnalystModel("anthropic"),
        strategistModel: model,
        sessionId,
        workflowStart,
        analystUsage: usageAcc,
        usage,
        reason: "max_iterations",
      });
    }

    const body = (await res.json()) as {
      content?: AnthropicContentBlock[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    usage = mergeUsage(usage, usageFromAnthropic(body.usage));

    const blocks = body.content || [];
    const toolUses = blocks.filter(
      (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
        b.type === "tool_use"
    );

    if (toolUses.length > 0) {
      messages.push({ role: "assistant", content: blocks });

      const toolResults: AnthropicContentBlock[] = [];
      for (const tu of toolUses) {
        const toolName = String(tu.name ?? "").trim();
        emitStep(hooks, `Wywołuję: ${toolName || "?"}…`);
        const result = toolName
          ? await executeAgentTool(ctx, toolName, tu.input || {})
          : { error: "Brak nazwy narzędzia w tool_use" };
        const observation = JSON.stringify(result).slice(0, 4000);
        reactTrace.push({
          thought: `Wywołanie ${toolName || "?"} w rundzie ${round + 1}`,
          action: toolName || "unknown_tool",
          actionInput: tu.input,
          observation,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: observation,
        });
      }
      messages.push({ role: "user", content: toolResults });
      if (isMaxIterationsReached(round) || shouldStopForToolBudget(reactTrace)) {
        return buildPartialAgenticResult({
          reactTrace,
          analystFacts,
          provider: "anthropic",
          productCount,
          analystModel: getAnalystModel("anthropic"),
          strategistModel: model,
          sessionId,
          workflowStart,
          analystUsage: usageAcc,
          usage,
          reason: "max_iterations",
        });
      }
      continue;
    }

    const textBlock = blocks.find((b) => b.type === "text");
    if (textBlock && textBlock.type === "text") {
      try {
        const payload = JSON.parse(stripJsonFences(textBlock.text)) as {
          reactTrace?: ReActStep[];
          suggestions?: Partial<AISuggestion>[];
        };
        const { trace, suggestions } = parseReActFromStrategistPayload(payload);
        return buildAgenticResult({
          suggestions,
          reactTrace: trace.length ? trace : reactTrace,
          analystFacts,
          provider: "anthropic",
          productCount,
          analystModel: getAnalystModel("anthropic"),
          strategistModel: model,
          sessionId,
          workflowStart,
          analystUsage: usageAcc,
          usage,
        });
      } catch {
        messages.push({ role: "assistant", content: textBlock.text });
        messages.push({
          role: "user",
          content: STRATEGIST_RETRY_HINT,
        });
      }
    }
  }

  return buildPartialAgenticResult({
    reactTrace,
    analystFacts,
    provider: "anthropic",
    productCount,
    analystModel: getAnalystModel("anthropic"),
    strategistModel: model,
    sessionId,
    workflowStart,
    analystUsage: usageAcc,
    usage,
    reason: "max_iterations",
  });
}

/**
 * Pełny workflow: Analityk → Strateg (ReAct + tools).
 */
export async function runAgenticInsightsWorkflow(
  ctx: SalesWorkbookContext,
  productCount: number,
  sessionId: string = createSessionId(),
  options: AgenticWorkflowOptions = {}
): Promise<AgenticInsightsResult> {
  const hooks = options.hooks;
  const provider = chooseProvider();
  if (provider === "none") {
    throw new Error("NO_LLM_PROVIDER");
  }

  const workflowStart = Date.now();
  let facts: AnalystFacts;
  let analystModel: string;
  let analystUsage = emptyUsage();

  try {
    const analyst = await runAnalystPass(ctx, productCount, emptyUsage(), hooks);
    facts = analyst.facts;
    analystModel = analyst.model;
    analystUsage = analyst.usage;
  } catch (e) {
    log.warn("Analyst pass failed — strategist continues on raw data", e);
    facts = await buildAnalystUnavailableFacts(ctx, productCount, e);
    analystModel =
      provider === "openai"
        ? getAnalystModel("openai")
        : getAnalystModel("anthropic");
  }

  const persona = resolveExpertPersona(facts);
  const userInstructions = options.userInstructions?.trim() || undefined;
  const strategistCtx: StrategistRunContext = { persona, userInstructions };
  emitStep(hooks, `Strateg (${personaLabel(persona)}) planuje rekomendacje…`);

  if (provider === "openai") {
    const result = await runStrategistReActOpenAI(
      ctx,
      facts,
      productCount,
      analystUsage,
      sessionId,
      workflowStart,
      strategistCtx,
      hooks
    );
    result.meta.analystModel = analystModel;
    result.meta.strategistPersona = persona;
    result.meta.userInstructionsApplied = Boolean(userInstructions);
    result.sessionId = sessionId;
    return result;
  }

  const result = await runStrategistReActAnthropic(
    ctx,
    facts,
    productCount,
    analystUsage,
    sessionId,
    workflowStart,
    strategistCtx,
    hooks
  );
  result.meta.analystModel = analystModel;
  result.meta.strategistPersona = persona;
  result.meta.userInstructionsApplied = Boolean(userInstructions);
  result.sessionId = sessionId;
  return result;
}

function collectToolsUsed(trace: ReActStep[]): string[] {
  return [...new Set(trace.map((s) => s.action).filter(Boolean))];
}

function parseInsightsOnly(raw: string): string | null {
  try {
    const p = JSON.parse(stripJsonFences(raw)) as { insights?: unknown };
    if (typeof p.insights === "string" && p.insights.trim()) {
      return p.insights.trim();
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Agent insight z function calling — model sam wybiera narzędzia zamiast dużego JSON w prompcie.
 */
export async function runAgentToolInsightLoop(
  ctx: SalesWorkbookContext,
  system: string,
  userHint: string
): Promise<AnalyticsAgentInsightsResponse> {
  const provider = chooseProvider();
  if (provider === "none") {
    throw new Error("NO_LLM_PROVIDER");
  }

  const reactTrace: ReActStep[] = [];
  const finalJsonHint =
    'Gdy masz dane, zwróć JSON: {"insights": string} — 6–18 zdań po polsku.';

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("MISSING_OPENAI");
    const client = new OpenAI({ apiKey });
    const model = getStrategistModel("openai");
    const tools = toolsToOpenAIFormat();
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: `${system}\n\n${finalJsonHint}` },
      { role: "user", content: userHint },
    ];

    for (let round = 0; round < MAX_ITERATIONS; round++) {
      if (shouldStopForToolBudget(reactTrace)) {
        return {
          insights: fallbackInsightsFromTrace(reactTrace),
          meta: {
            provider: "openai",
            model,
            orchestration: "react-tools-agent-insight-partial",
            toolsUsed: collectToolsUsed(reactTrace),
          },
        };
      }

      let res: OpenAI.Chat.ChatCompletion;
      try {
        res = await withRateLimitRetry(() =>
          client.chat.completions.create({
            model,
            temperature: 0.35,
            tools,
            tool_choice: "auto",
            messages,
          })
        );
      } catch (e) {
        log.error("Agent insight OpenAI error", e);
        return {
          insights: fallbackInsightsFromTrace(reactTrace),
          meta: {
            provider: "openai",
            model,
            orchestration: "react-tools-agent-insight-error",
            toolsUsed: collectToolsUsed(reactTrace),
          },
        };
      }

      const msg = res.choices[0]?.message;
      if (!msg) break;

      if (msg.tool_calls?.length) {
        messages.push({
          role: "assistant",
          content: msg.content ?? null,
          tool_calls: msg.tool_calls,
        });
        for (const tc of msg.tool_calls) {
          const toolName = tc.function?.name?.trim() || "";
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function?.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = { _parseError: "invalid_json_arguments" };
          }
          const result = toolName
            ? await executeAgentTool(ctx, toolName, args)
            : { error: "Brak nazwy narzędzia w tool_call" };
          const observation = JSON.stringify(result).slice(0, 4000);
          reactTrace.push({
            thought: msg.content?.trim() || `Wywołanie ${toolName || "?"}`,
            action: toolName || "unknown_tool",
            actionInput: args,
            observation,
          });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: observation,
          });
        }
        if (shouldStopForToolBudget(reactTrace)) {
          return {
            insights: fallbackInsightsFromTrace(reactTrace),
            meta: {
              provider: "openai",
              model,
              orchestration: "react-tools-agent-insight-partial",
              toolsUsed: collectToolsUsed(reactTrace),
            },
          };
        }
        continue;
      }

      const text = msg.content?.trim();
      if (text) {
        const insights = parseInsightsOnly(text);
        if (insights) {
          return {
            insights,
            meta: {
              provider: "openai",
              model,
              orchestration: "react-tools-agent-insight",
              toolsUsed: collectToolsUsed(reactTrace),
            },
          };
        }
        messages.push({ role: "assistant", content: text });
        messages.push({ role: "user", content: finalJsonHint });
      }
    }
    return {
      insights: fallbackInsightsFromTrace(reactTrace),
      meta: {
        provider: "openai",
        model,
        orchestration: "react-tools-agent-insight-partial",
        toolsUsed: collectToolsUsed(reactTrace),
      },
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("MISSING_ANTHROPIC");
  const model = getStrategistModel("anthropic");
  const toolDefs = toolsToOpenAIFormat().map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  type AnthropicMessage = {
    role: "user" | "assistant";
    content: string | AnthropicContentBlock[];
  };
  type AnthropicContentBlock =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string };

  const messages: AnthropicMessage[] = [
    {
      role: "user",
      content: `${userHint}\n\nPlik Excel: ${ctx.filename}`,
    },
  ];

  for (let round = 0; round < MAX_ITERATIONS; round++) {
    if (shouldStopForToolBudget(reactTrace)) {
      return {
        insights: fallbackInsightsFromTrace(reactTrace),
        meta: {
          provider: "anthropic",
          model,
          orchestration: "react-tools-agent-insight-partial",
          toolsUsed: collectToolsUsed(reactTrace),
        },
      };
    }

    let res: Response;
    try {
      res = await withRateLimitRetry(() =>
        fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: `${system}\n\n${finalJsonHint}`,
            tools: toolDefs,
            messages,
          }),
        })
      );
    } catch (e) {
      log.error("Agent insight Anthropic error", e);
      return {
        insights: fallbackInsightsFromTrace(reactTrace),
        meta: {
          provider: "anthropic",
          model,
          orchestration: "react-tools-agent-insight-error",
          toolsUsed: collectToolsUsed(reactTrace),
        },
      };
    }

    if (!res.ok) {
      log.error(`Agent insight Anthropic HTTP ${res.status}`);
      return {
        insights: fallbackInsightsFromTrace(reactTrace),
        meta: {
          provider: "anthropic",
          model,
          orchestration: "react-tools-agent-insight-error",
          toolsUsed: collectToolsUsed(reactTrace),
        },
      };
    }

    const body = (await res.json()) as { content?: AnthropicContentBlock[] };
    const blocks = body.content || [];
    const toolUses = blocks.filter(
      (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
        b.type === "tool_use"
    );

    if (toolUses.length > 0) {
      messages.push({ role: "assistant", content: blocks });
      const toolResults: AnthropicContentBlock[] = [];
      for (const tu of toolUses) {
        const toolName = String(tu.name ?? "").trim();
        const result = toolName
          ? await executeAgentTool(ctx, toolName, tu.input || {})
          : { error: "Brak nazwy narzędzia w tool_use" };
        const observation = JSON.stringify(result).slice(0, 4000);
        reactTrace.push({
          thought: `Wywołanie ${toolName || "?"}`,
          action: toolName || "unknown_tool",
          actionInput: tu.input,
          observation,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: observation,
        });
      }
      messages.push({ role: "user", content: toolResults });
      if (shouldStopForToolBudget(reactTrace)) {
        return {
          insights: fallbackInsightsFromTrace(reactTrace),
          meta: {
            provider: "anthropic",
            model,
            orchestration: "react-tools-agent-insight-partial",
            toolsUsed: collectToolsUsed(reactTrace),
          },
        };
      }
      continue;
    }

    const textBlock = blocks.find((b) => b.type === "text");
    if (textBlock?.type === "text") {
      const insights = parseInsightsOnly(textBlock.text);
      if (insights) {
        return {
          insights,
          meta: {
            provider: "anthropic",
            model,
            orchestration: "react-tools-agent-insight",
            toolsUsed: collectToolsUsed(reactTrace),
          },
        };
      }
    }
  }

  return {
    insights: fallbackInsightsFromTrace(reactTrace),
    meta: {
      provider: "anthropic",
      model,
      orchestration: "react-tools-agent-insight-partial",
      toolsUsed: collectToolsUsed(reactTrace),
    },
  };
}
