/**
 * Testy jednostkowe: agentEval (fuzzy) + agentGuardrails.
 * Uruchomienie: npm run test:agent
 */
import {
  evaluateAllSuggestions,
  extractMentionedProducts,
  fuzzyProductMatch,
  normalizeProductKey,
  verifyAgentOutput,
} from "../services/agentEval";
import {
  MAX_ITERATIONS,
  buildPartialSuggestions,
  countToolSteps,
  isMaxIterationsReached,
  isTokenLimitExceeded,
  shouldStopForToolBudget,
} from "../services/agentGuardrails";
import type { AISuggestion, ReActTraceStep } from "../shared/api-types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`  FAIL: ${message}`);
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  const ok =
    typeof actual === "object" && actual !== null
      ? JSON.stringify(actual) === JSON.stringify(expected)
      : actual === expected;
  assert(ok, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function section(name: string): void {
  console.log(`\n▸ ${name}`);
}

// --- agentEval ---

section("normalizeProductKey / fuzzyProductMatch");
assertEq(normalizeProductKey("  Mleko UHT 1L  "), "mleko uht 1l", "trim + lowercase");
assert(
  fuzzyProductMatch("mleko uht 1l", "Mleko UHT 1L"),
  "case-insensitive catalog match"
);
assert(
  fuzzyProductMatch("żurek", "Zurek"),
  "diacritics stripped (żurek vs Zurek)"
);
assert(!fuzzyProductMatch("abc", "xyz"), "unrelated products do not match");
assert(
  fuzzyProductMatch("mleko uht", "Mleko UHT 1L"),
  "substring match for longer SKU"
);

section("verifyAgentOutput");
const catalog = ["Mleko UHT 1L", "Chleb razowy", "Masło 200g"];
const factsWithProduct = {
  summary: "ok",
  anomalies: [],
  metrics: { topProductNames: ["Mleko UHT 1L"] },
  toolSnapshots: {},
};

const suggestionOk: AISuggestion = {
  title: "Domów: mleko uht 1l",
  description: "Wysoka rotacja.",
  priority: "high",
};
const rOk = verifyAgentOutput(factsWithProduct, suggestionOk, catalog);
assert(rOk.verified, "product in facts (fuzzy title) → verified");
assert(!rOk.eval.potential_hallucination, "no hallucination flag when anchored");

const suggestionHallucination: AISuggestion = {
  title: "Promocja: Masło 200g",
  description: "Rabat -20%.",
  priority: "medium",
};
const factsNoMaslo = {
  summary: "ok",
  anomalies: [],
  metrics: { topProductNames: ["Mleko UHT 1L"] },
  toolSnapshots: {},
};
const rHall = verifyAgentOutput(factsNoMaslo, suggestionHallucination, catalog);
assert(!rHall.verified, "catalog product not in facts → not verified");
assert(rHall.eval.potential_hallucination === true, "hallucination flag set");

const suggestionGeneric: AISuggestion = {
  title: "Przejrzyj raport sprzedaży",
  description: "Brak konkretnego SKU.",
  priority: "low",
};
const rGeneric = verifyAgentOutput(factsNoMaslo, suggestionGeneric, catalog);
assert(rGeneric.verified, "no product mention → verified (skip eval)");

section("extractMentionedProducts");
const mentioned = extractMentionedProducts(
  { title: "Przecena -30%: chleb razowy", description: "", priority: "high" },
  catalog
);
assert(mentioned.some((m) => fuzzyProductMatch(m, "Chleb razowy")), "extracts catalog SKU from title");

section("evaluateAllSuggestions");
const { suggestions: evaluated, summary } = evaluateAllSuggestions(
  factsNoMaslo,
  [suggestionOk, suggestionHallucination, suggestionGeneric],
  catalog
);
assertEq(evaluated.length, 3, "evaluates all suggestions");
assert(summary.total === 3, "summary total");
assert(summary.potential_hallucination >= 1, "at least one hallucination counted");

// --- agentGuardrails ---

section("countToolSteps / shouldStopForToolBudget");
const emptyTrace: ReActTraceStep[] = [];
assertEq(countToolSteps(emptyTrace), 0, "empty trace");
const trace3: ReActTraceStep[] = [
  { thought: "a", action: "getTopProducts", actionInput: {}, observation: "{}" },
  { thought: "b", action: "getLowStockAlerts", actionInput: {}, observation: "{}" },
  { thought: "c", action: "", actionInput: {}, observation: "{}" },
];
assertEq(countToolSteps(trace3), 2, "ignores empty action names");

const traceAtLimit: ReActTraceStep[] = Array.from({ length: MAX_ITERATIONS }, (_, i) => ({
  thought: `t${i}`,
  action: "getTopProducts",
  actionInput: { limit: 5 },
  observation: "{}",
}));
assert(
  shouldStopForToolBudget(traceAtLimit),
  `shouldStop when trace has ${MAX_ITERATIONS} tool steps`
);
assert(
  !shouldStopForToolBudget(trace3),
  "should not stop below MAX_ITERATIONS tool steps"
);

section("isMaxIterationsReached / isTokenLimitExceeded");
assert(!isMaxIterationsReached(0), "round 0 not max");
assert(isMaxIterationsReached(MAX_ITERATIONS - 1), "last allowed round index");
assert(
  isTokenLimitExceeded({
    prompt_tokens: 20_000,
    completion_tokens: 10_000,
    total_tokens: 30_000,
  }),
  "token limit exceeded at 30k"
);
assert(
  !isTokenLimitExceeded({
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
  }),
  "under token limit"
);

section("buildPartialSuggestions");
const partial = buildPartialSuggestions(
  [
    {
      thought: "x",
      action: "predictFutureSales",
      actionInput: {},
      observation: '{"predictedTotalQuantity30d":100}',
    },
  ],
  { summary: "s", anomalies: ["Spadek rotacji SKU-A"], metrics: {} }
);
assert(partial.length >= 1, "returns at least one partial suggestion");
assert(
  partial.some((s) => s.title.includes("anomal") || s.title.includes("predictFutureSales")),
  "includes anomaly or last tool hint"
);

// --- summary ---

console.log("\n--- Wynik ---");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}

console.log("Wszystkie testy agentEval + guardrails OK.\n");
