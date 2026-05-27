import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  canSpend,
  getBudgetStatus,
  recordSpend,
} from "../utils/budgetManager";

describe("budgetManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00Z"));
    __resetForTests({ maxUsdPerDay: 10 });
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetForTests();
  });

  it("canSpend returns ok when under budget", () => {
    const result = canSpend(0.05);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(10);
  });

  it("canSpend returns not-ok when at limit", () => {
    recordSpend(10, "fill");
    const result = canSpend(0.01);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("recordSpend increments currentSpendUsd", () => {
    recordSpend(2.5, "test");
    expect(getBudgetStatus().currentSpendUsd).toBe(2.5);
  });

  it("resetIfNewDay resets when date changes", () => {
    recordSpend(5, "day1");
    expect(getBudgetStatus().currentSpendUsd).toBe(5);

    vi.setSystemTime(new Date("2026-05-28T12:00:00Z"));
    const status = getBudgetStatus();
    expect(status.currentSpendUsd).toBe(0);
    expect(status.dateKey).toBe("2026-05-28");
  });

  it("remaining never goes negative", () => {
    recordSpend(15, "over");
    const status = getBudgetStatus();
    expect(status.remainingUsd).toBe(0);
    expect(status.currentSpendUsd).toBe(15);
  });
});
