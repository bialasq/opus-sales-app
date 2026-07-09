import type { AuthMeResponse, AiPerformanceStats } from "@shared/api-types";

/** Minimalny profil użytkownika do testów Cypress (login + /auth/me). */
export const mockAuthMe: AuthMeResponse = {
  userId: "user-e2e-1",
  organizationId: "org-e2e-1",
  role: "ADMIN",
  email: "e2e@opus.test",
  name: "E2E Tester",
  organizationName: "Opus Test Org",
};

/** Pusty stan statystyk AI — panel pokazuje empty state. */
export const mockEmptyAiPerformance: AiPerformanceStats = {
  totalRuns: 0,
  avgCostUsd: 0,
  avgLatencyMs: 0,
  totalTokens: 0,
  approvalRatePercent: null,
  totalFeedback: 0,
  approvedCount: 0,
  rejectedCount: 0,
  hallucinationCount: 0,
  hallucinationRatePercent: null,
  cacheEntries: 0,
  recentRuns: [],
};

/** Rejestruje mocki API wymagane przez flow logowania i dashboard. */
export function stubAuthAndDashboardApi(): void {
  cy.intercept("POST", "**/api/auth/login", {
    statusCode: 200,
    body: { accessToken: "E2E_TOKEN" },
  }).as("login");

  cy.intercept("GET", "**/api/auth/me", {
    statusCode: 200,
    body: mockAuthMe,
  }).as("me");

  cy.intercept("GET", "**/api/files", {
    statusCode: 200,
    body: { files: [] },
  }).as("files");

  cy.intercept("GET", "**/api/ai/performance", {
    statusCode: 200,
    body: mockEmptyAiPerformance,
  }).as("aiPerformance");
}
