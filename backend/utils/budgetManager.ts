import { createLogger } from "../services/appLogger";

const log = createLogger("budgetManager");

interface BudgetState {
  maxUsdPerDay: number;
  currentSpendUsd: number;
  dateKey: string;
}

const state: BudgetState = {
  maxUsdPerDay: parseFloat(process.env.AI_BUDGET_USD_PER_DAY || "10"),
  currentSpendUsd: 0,
  dateKey: getDateKey(),
};

function getDateKey(): string {
  return new Date().toISOString().split("T")[0];
}

function resetIfNewDay(): void {
  const today = getDateKey();
  if (state.dateKey !== today) {
    log.info(
      `Budget reset: ${state.dateKey} → ${today} (spent $${state.currentSpendUsd.toFixed(4)})`
    );
    state.currentSpendUsd = 0;
    state.dateKey = today;
  }
}

/** Konserwatywny szacunek przed wywołaniem LLM (niedoszacowanie = ryzyko przekroczenia budżetu). */
export const ESTIMATED_USD_PER_LLM_REQUEST = 0.05;

export function canSpend(estimatedUsd: number): { ok: boolean; remaining: number } {
  resetIfNewDay();
  const remaining = Math.max(0, state.maxUsdPerDay - state.currentSpendUsd);
  return {
    ok: state.currentSpendUsd + estimatedUsd <= state.maxUsdPerDay,
    remaining,
  };
}

export function recordSpend(usd: number, label?: string): void {
  resetIfNewDay();
  if (usd <= 0) return;
  state.currentSpendUsd += usd;
  log.info(
    `Budget spend +$${usd.toFixed(4)} (${label || "unknown"}). Total today: $${state.currentSpendUsd.toFixed(4)}/$${state.maxUsdPerDay}`
  );
}

export function getBudgetStatus() {
  resetIfNewDay();
  const remainingUsd = Math.max(0, state.maxUsdPerDay - state.currentSpendUsd);
  return {
    maxUsdPerDay: state.maxUsdPerDay,
    currentSpendUsd: state.currentSpendUsd,
    remainingUsd,
    dateKey: state.dateKey,
  };
}

export function isDailyBudgetExceededError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Daily AI budget exceeded")
  );
}

/** Tylko testy — reset stanu budżetu. */
export function __resetForTests(overrides?: Partial<BudgetState>): void {
  state.currentSpendUsd = 0;
  state.dateKey = getDateKey();
  if (overrides?.maxUsdPerDay !== undefined) {
    state.maxUsdPerDay = overrides.maxUsdPerDay;
  } else {
    state.maxUsdPerDay = parseFloat(process.env.AI_BUDGET_USD_PER_DAY || "10");
  }
}
