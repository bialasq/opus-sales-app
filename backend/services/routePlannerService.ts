import type { RoutePlanResponse, RoutePlanStop } from "../shared/api-types";
import {
  ROUTE_PLANNER_SYSTEM_PROMPT,
  ROUTE_PLANNER_USER_HINT,
  ROUTE_PLANNER_JSON_HINT,
} from "../prompts";
import {
  SalesWorkbookContext,
  executeAgentTool,
  getRoutePlannerTools,
  toolsToOpenAIFormat,
} from "./aiAgentTools";
import { createLogger } from "./appLogger";
import { GUARDRAIL_MESSAGES, MAX_ITERATIONS, shouldStopForToolBudget } from "./agentGuardrails";
import {
  chooseProvider,
  invokeOpenAiChatRound,
  isLlmBudgetExceededError,
  type OpenAiChatMessage,
} from "./llmInvoke";
import {
  FUEL_PLN_PER_KM,
  MAX_DRIVING_HOURS_PER_DAY,
  MAX_ONE_WAY_HOURS_FROM_BASE,
  ROUTE_BASE_CITY,
  estimateLeg,
  DEFAULT_VISIT_MINUTES,
  resolveCityCoords,
} from "./routeMatrix";
import { finalizeVisitRoute } from "./routeBudget";
import { buildRouteVisitCandidates } from "./routeVisitCandidates";
import type { ReActTraceStep } from "../shared/api-types";

const log = createLogger("routePlannerService");

const FORBIDDEN_SAME_DAY = [
  ["elbląg", "ełk"],
  ["elblag", "elk"],
];

type ParsedRoutePayload = {
  route_plan?: {
    stops?: Partial<RoutePlanStop>[];
    cluster?: string;
    summary?: string;
  };
  total_driving_time_hours?: number;
  total_visit_time_hours?: number;
  estimated_fuel_cost?: number;
  guardrail_warnings?: string[];
};

function stripJsonFences(raw: string): string {
  return raw.replace(/```json\n?|\n?```/g, "").trim();
}

function normalizeCity(c: string): string {
  return c
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");
}

function hasForbiddenPair(cities: string[]): string | null {
  const norms = cities.map(normalizeCity);
  for (const [a, b] of FORBIDDEN_SAME_DAY) {
    if (norms.includes(a) && norms.includes(b)) {
      return `${a} + ${b}`;
    }
  }
  return null;
}

function enrichVisitStops(stops: Partial<RoutePlanStop>[]): RoutePlanStop[] {
  return stops
    .filter((s) => {
      const city = String(s.city ?? "").trim();
      if (!city || city === ROUTE_BASE_CITY) return false;
      const goal = String(s.visitGoal ?? "").toLowerCase();
      return !goal.includes("baza") && !goal.includes("start") && !goal.includes("powrót");
    })
    .map((s, i) => {
      const city = String(s.city ?? "").trim();
      const coords = resolveCityCoords(city);
      return {
        order: s.order ?? i + 1,
        city,
        clientName: String(s.clientName ?? "—"),
        visitGoal: String(s.visitGoal ?? "Wizyta handlowa"),
        driveTimeHoursFromPrevious: Number(s.driveTimeHoursFromPrevious ?? 0),
        driveTimeLabel: s.driveTimeLabel,
        visitDurationMinutes: Number(s.visitDurationMinutes ?? DEFAULT_VISIT_MINUTES),
        lat: s.lat ?? coords?.lat,
        lng: s.lng ?? coords?.lng,
      };
    });
}

function applyExtraGuardrails(
  visitStops: RoutePlanStop[],
  drivingHours: number
): string[] {
  const warnings: string[] = [];
  const cities = visitStops.map((s) => s.city);
  const forbidden = hasForbiddenPair(cities);
  if (forbidden) {
    warnings.push(`Zabronione w jednym dniu: ${forbidden} — usuń jedno z miast.`);
  }
  if (drivingHours > MAX_DRIVING_HOURS_PER_DAY) {
    warnings.push(
      `Przekroczono limit jazdy ${MAX_DRIVING_HOURS_PER_DAY}h (szac. ${drivingHours}h).`
    );
  }
  for (const s of visitStops) {
    const leg = estimateLeg(ROUTE_BASE_CITY, s.city);
    if (!("error" in leg) && leg.driveTimeHours > MAX_ONE_WAY_HOURS_FROM_BASE) {
      warnings.push(
        `${s.city} poza zasięgiem 2h od bazy (~${leg.driveTimeLabel}).`
      );
    }
  }
  return warnings;
}

function buildRouteResponse(
  payload: ParsedRoutePayload,
  finalized: ReturnType<typeof finalizeVisitRoute>,
  meta: RoutePlanResponse["meta"],
  reactTrace: ReActTraceStep[]
): RoutePlanResponse {
  const drivingHours = Number((finalized.drivingMinutes / 60).toFixed(2));
  const visitHours = Number((finalized.visitMinutes / 60).toFixed(2));
  const fullLoopKm = finalized.fullLoopKm;

  const routePlan = {
    baseCity: ROUTE_BASE_CITY,
    cluster: payload.route_plan?.cluster,
    summary:
      payload.route_plan?.summary ??
      `Trasa ${finalized.visitStops.length} wizyt, ${finalized.totalMinutes} min / 480 min (w tym powrót ${finalized.returnMinutes} min do Olsztyna).`,
    stops: finalized.mapStops,
  };

  const metaWarnings = [...new Set([...finalized.metaWarnings])];

  return {
    route_plan: routePlan,
    total_driving_time: drivingHours,
    total_visit_time_hours: visitHours,
    estimated_fuel_cost: Number((fullLoopKm * FUEL_PLN_PER_KM).toFixed(2)),
    meta: {
      ...meta,
      route_plan: routePlan,
      warnings: metaWarnings,
      fullLoopKm,
    },
    reactTrace,
    guardrail_warnings: [
      ...finalized.warnings,
      ...applyExtraGuardrails(finalized.visitStops, drivingHours),
      ...(payload.guardrail_warnings ?? []),
    ],
  };
}

async function buildFallbackPlan(
  filename: string,
  organizationId: string
): Promise<RoutePlanResponse> {
  const { candidates } = await buildRouteVisitCandidates(filename, organizationId);
  const picked = candidates.filter((c) => c.reachableFromBase).slice(0, 6);
  const rawStops: RoutePlanStop[] = picked.map((c) => {
    const coords = resolveCityCoords(c.city);
    return {
      order: 0,
      city: c.city,
      clientName: c.clientName,
      visitGoal: c.visitGoal,
      driveTimeHoursFromPrevious: c.driveTimeFromBaseHours ?? 1,
      driveTimeLabel: c.driveTimeFromBaseLabel,
      visitDurationMinutes: DEFAULT_VISIT_MINUTES,
      lat: coords?.lat,
      lng: coords?.lng,
    };
  });

  const finalized = finalizeVisitRoute(rawStops);

  return buildRouteResponse(
    {
      route_plan: {
        cluster: "automatyczny (fallback regułowy)",
        summary: `Plan ${finalized.visitStops.length} wizyt — sortowanie geograficzne, budżet 480 min.`,
      },
    },
    finalized,
    {
      provider: "fallback",
      orchestration: "sales-route-optimizer-rules",
      persona: "regional_logistics_manager",
    },
    []
  );
}

async function buildBudgetExceededRoutePlan(
  filename: string,
  organizationId: string,
  reactTrace: ReActTraceStep[],
  llmError: string
): Promise<RoutePlanResponse> {
  const fb = await buildFallbackPlan(filename, organizationId);
  fb.reactTrace = reactTrace;
  fb.meta = {
    ...fb.meta,
    budgetExceeded: true,
    llmError,
    orchestration: "sales-route-optimizer-budget",
  };
  fb.guardrail_warnings = [
    ...(fb.guardrail_warnings ?? []),
    GUARDRAIL_MESSAGES.budget_exceeded,
  ];
  return fb;
}

/**
 * Sales Route Optimizer — dedykowana pętla agenta (Regional Logistics Manager).
 */
export async function planSalesRoute(
  filename: string,
  organizationId: string,
  userInstructions?: string
): Promise<RoutePlanResponse> {
  const provider = chooseProvider();
  if (provider === "none") {
    return await buildFallbackPlan(filename, organizationId);
  }

  const ctx = new SalesWorkbookContext(filename, organizationId);
  const tools = toolsToOpenAIFormat(getRoutePlannerTools());
  const reactTrace: ReActTraceStep[] = [];
  const candidatesPreview = await buildRouteVisitCandidates(
    filename,
    organizationId
  );

  const system =
    ROUTE_PLANNER_SYSTEM_PROMPT +
    (userInstructions?.trim()
      ? `\n\nDirect User Constraint:\n${userInstructions.trim()}`
      : "");

  const userHint = ROUTE_PLANNER_USER_HINT(
    filename,
    candidatesPreview.candidates.slice(0, 12)
  );

  if (provider === "openai") {
    const model =
      process.env.AI_STRATEGIST_MODEL || process.env.AI_MODEL || "gpt-4o";

    const messages: OpenAiChatMessage[] = [
      { role: "system", content: `${system}\n\n${ROUTE_PLANNER_JSON_HINT}` },
      { role: "user", content: userHint },
    ];

    for (let round = 0; round < MAX_ITERATIONS; round++) {
      if (shouldStopForToolBudget(reactTrace)) break;
      try {
        const roundResult = await invokeOpenAiChatRound({
          model,
          temperature: 0.25,
          tools,
          tool_choice: "auto",
          messages,
        });
        const msg = roundResult.message;
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
              args = {};
            }
            const result = toolName
              ? await executeAgentTool(ctx, toolName, args)
              : { error: "Brak nazwy narzędzia" };
            const observation = JSON.stringify(result).slice(0, 4000);
            reactTrace.push({
              thought: msg.content?.trim() || `Narzędzie ${toolName}`,
              action: toolName || "unknown",
              actionInput: args,
              observation,
            });
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: observation,
            });
          }
          continue;
        }

        const text = msg.content?.trim();
        if (text) {
          try {
            const payload = JSON.parse(stripJsonFences(text)) as ParsedRoutePayload;
            const visitStops = enrichVisitStops(payload.route_plan?.stops ?? []);
            const finalized = finalizeVisitRoute(visitStops);
            return buildRouteResponse(
              payload,
              finalized,
              {
                provider: "openai",
                model,
                orchestration: "sales-route-optimizer",
                persona: "regional_logistics_manager",
              },
              reactTrace
            );
          } catch {
            messages.push({ role: "assistant", content: text });
            messages.push({ role: "user", content: ROUTE_PLANNER_JSON_HINT });
          }
        }
      } catch (e) {
        if (isLlmBudgetExceededError(e)) {
          return await buildBudgetExceededRoutePlan(
            filename,
            organizationId,
            reactTrace,
            e instanceof Error ? e.message : String(e)
          );
        }
        log.error("Route planner OpenAI error", e);
        break;
      }
    }
  }

  const fallback = await buildFallbackPlan(filename, organizationId);
  fallback.reactTrace = reactTrace;
  return fallback;
}
