import type {

  AISuggestion,

  AiInsightsResponse,

  ProductRotationMetricRow,

  SuggestionFeedbackBody,

} from "../shared/api-types";

import { evaluateAllSuggestions } from "./agentEval";

import { SalesWorkbookContext } from "./aiAgentTools";

import { buildCacheKey, getCachedInsights, setCachedInsights } from "./agentCache";

import {

  completeJob,

  createJob,

  failJob,

  getJob,

  updateJobStep,

} from "./agentJobStore";

import {

  createSessionId,

  logAgentTraceAsync,

  logSuggestionFeedbackAsync,

} from "./aiLogger";

import {

  runAgenticInsightsWorkflow,

  type AgenticWorkflowOptions,

  type WorkflowHooks,

} from "./agentOrchestrator";

import { createLogger } from "./appLogger";

import { runJudgeReview } from "./judgeService";

import { chooseProvider } from "./llmInvoke";



const log = createLogger("aiService");



export { chooseProvider } from "./llmInvoke";

export {

  buildProductRotationMetrics,

  extractSalesRows,

  readWorkbookFromUploads,

  analyzeSalesFromFile,

} from "./salesMetrics";



export type GetAiInsightsOptions = {

  sessionId?: string;

  hooks?: WorkflowHooks;

  skipCache?: boolean;

  userInstructions?: string;

};



function fallbackInsights(

  products: ProductRotationMetricRow[]

): AISuggestion[] {

  const sortedLow = [...products].sort((a, b) => a.rotationRate - b.rotationRate);

  const sortedHigh = [...products].sort((a, b) => b.rotationRate - a.rotationRate);

  const out: AISuggestion[] = [];



  for (const p of sortedLow.slice(0, 3)) {

    if (p.rotationRate >= 0.4) continue;

    out.push({

      title: `Przecena: ${p.name}`,

      description: `Niska rotacja (${(p.rotationRate * 100).toFixed(1)}%) — rozważ rabat -20% lub przesunięcie na magazyn.`,

      priority: p.rotationRate < 0.25 ? "high" : "medium",

    });

  }



  for (const p of sortedHigh.slice(0, 3)) {

    if (p.rotationRate <= 0.55) continue;

    out.push({

      title: `Domów: ${p.name}`,

      description: `Wysoka rotacja — domów ${Math.max(20, Math.round(p.totalQuantity * 0.3))} szt.`,

      priority: p.rotationRate > 0.8 ? "high" : "medium",

    });

  }



  if (out.length === 0 && products.length > 0) {

    out.push({

      title: "Brak wyraźnych priorytetów",

      description: "Rotacja zbliżona do średniej — wgraj dłuższy okres danych.",

      priority: "low",

    });

  }

  return out.slice(0, 8);

}



function buildMetaFromWorkflow(

  result: Awaited<ReturnType<typeof runAgenticInsightsWorkflow>>,

  evalSummary: { total: number; verified: number; potential_hallucination: number },

  extras?: Partial<AiInsightsResponse["meta"]>

): AiInsightsResponse["meta"] {

  return {

    provider: extras?.provider ?? result.meta.provider,

    productCount: result.meta.productCount,

    orchestration: result.meta.orchestration,

    analystModel: result.meta.analystModel,

    strategistModel: result.meta.strategistModel,

    strategistPersona: result.meta.strategistPersona,

    userInstructionsApplied: result.meta.userInstructionsApplied,

    promptVersion: result.promptVersion,

    sessionId: result.sessionId,

    latency_ms: result.latency_ms,

    total_tokens: result.total_tokens,

    cost_usd: result.cost_usd,

    evalSummary,

    judge_review: extras?.judge_review,

    partial: result.meta.partial,

    partialReason: result.meta.partialReason,

    guardrailMessage: result.meta.guardrailMessage,

    ...extras,

  };

}



async function finalizeResponse(

  filename: string,

  sessionId: string,

  products: ProductRotationMetricRow[],

  result: Awaited<ReturnType<typeof runAgenticInsightsWorkflow>>,

  providerOverride?: string

): Promise<AiInsightsResponse> {

  const catalogNames = products.map((p) => p.name);

  const rawSuggestions = result.suggestions.length

    ? result.suggestions

    : fallbackInsights(products);



  const { suggestions, summary } = evaluateAllSuggestions(

    result.analystFacts ?? undefined,

    rawSuggestions,

    catalogNames

  );



  const judge_review =

    result.analystFacts && suggestions.length

      ? await runJudgeReview(result.analystFacts, suggestions)

      : null;



  logAgentTraceAsync({

    sessionID: result.sessionId,

    workflow: "getAiInsightsForFile",

    filename,

    models: {

      analyst: result.meta.analystModel,

      strategist: result.meta.strategistModel,

    },

    full_trace: result.reactTrace,

    analyst_facts: result.analystFacts,

    suggestions_count: suggestions.length,

    total_tokens: result.total_tokens,

    cost_usd: result.cost_usd,

    latency_ms: result.latency_ms,

    eval_summary: {

      verified: summary.verified,

      potential_hallucination: summary.potential_hallucination,

    },

    meta: {

      ...result.meta,

      partial: result.meta.partial,

      judge_review: judge_review ?? undefined,

    },

  });



  return {

    suggestions,

    meta: buildMetaFromWorkflow(

      result,

      summary,

      {

        ...(providerOverride ? { provider: providerOverride } : {}),

        judge_review,

      }

    ),

    reactTrace: result.reactTrace,

    analystFacts: result.analystFacts ?? undefined,

  };

}



/**

 * Agentic workflow z cache, guardrails i opcjonalnym śledzeniem kroków.

 */

export async function getAiInsightsForFile(

  filename: string,

  options: GetAiInsightsOptions = {}

): Promise<AiInsightsResponse> {

  const sessionId = options.sessionId ?? createSessionId();

  const userInstructions = options.userInstructions?.trim() || undefined;

  const cacheKey = buildCacheKey(filename, {

    userInstructions: userInstructions ?? "",

  });



  if (!options.skipCache) {

    const cached = getCachedInsights(cacheKey);

    if (cached) {

      logAgentTraceAsync({

        sessionID: cached.meta.sessionId ?? sessionId,

        workflow: "getAiInsightsForFile",

        filename,

        full_trace: cached.reactTrace ?? [],

        analyst_facts: cached.analystFacts,

        suggestions_count: cached.suggestions.length,

        total_tokens: cached.meta.total_tokens ?? 0,

        cost_usd: cached.meta.cost_usd ?? 0,

        latency_ms: 0,

        meta: { from_cache: true, cache_hit: true },

      });

      return cached;

    }

  }



  const ctx = new SalesWorkbookContext(filename);

  const products = ctx.getProducts();

  const provider = chooseProvider();



  if (products.length === 0) {

    return {

      suggestions: [],

      meta: {

        provider: provider === "none" ? "fallback" : provider,

        productCount: 0,

        emptyDataset: true,

        sessionId,

      },

    };

  }



  if (provider === "none") {

    const catalogNames = products.map((p) => p.name);

    const { suggestions, summary } = evaluateAllSuggestions(

      undefined,

      fallbackInsights(products),

      catalogNames

    );

    return {

      suggestions,

      meta: {

        provider: "fallback",

        productCount: products.length,

        orchestration: "rules-only",

        sessionId,

        evalSummary: summary,

      },

    };

  }



  const workflowOptions: AgenticWorkflowOptions = {

    hooks: options.hooks,

    userInstructions,

  };



  try {

    const result = await runAgenticInsightsWorkflow(

      ctx,

      products.length,

      sessionId,

      workflowOptions

    );

    const response = await finalizeResponse(

      filename,

      sessionId,

      products,

      result,

      result.suggestions.length ? undefined : `${result.meta.provider}-parsed-empty`

    );

    setCachedInsights(cacheKey, response);

    return response;

  } catch (e) {

    log.error("Agentic workflow error", e);

    const catalogNames = products.map((p) => p.name);

    const { suggestions, summary } = evaluateAllSuggestions(

      undefined,

      fallbackInsights(products),

      catalogNames

    );

    return {

      suggestions,

      meta: {

        provider: `${provider}-error-fallback`,

        productCount: products.length,

        orchestration: "analyst-react-tools-strategist-failed",

        sessionId,

        evalSummary: summary,

      },

    };

  }

}



/** Uruchamia analizę w tle — frontend polluje status */

export function startAiInsightsJob(

  filename: string,

  userInstructions?: string

): string {

  const sessionId = createSessionId();

  const trimmed = userInstructions?.trim() || undefined;

  createJob(sessionId, filename, trimmed);



  void (async () => {

    try {

      const response = await getAiInsightsForFile(filename, {

        sessionId,

        skipCache: false,

        userInstructions: trimmed,

        hooks: {

          onStep: (step) => updateJobStep(sessionId, step),

        },

      });

      completeJob(sessionId, response);

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e);

      failJob(sessionId, msg);

    }

  })();



  return sessionId;

}



export function getAiInsightsJobStatus(sessionId: string) {

  const job = getJob(sessionId);

  if (!job) return null;

  return {

    sessionId: job.sessionId,

    status: job.status,

    current_step: job.current_step,

    result: job.result,

    error: job.error,

  };

}



export function recordSuggestionFeedback(feedback: SuggestionFeedbackBody): string {

  logSuggestionFeedbackAsync(feedback);

  const safeSession = feedback.sessionId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36);

  return `traces/${safeSession}-feedback.jsonl`;

}



export type {

  AISuggestion as AiInsight,

  AiInsightPriority,

  ProductRotationMetricRow as ProductRotationRow,

  AiInsightsResponse,

  ReActTraceStep,

  AnalystFactsPayload,

  EvaluatedAISuggestion,

} from "../shared/api-types";


