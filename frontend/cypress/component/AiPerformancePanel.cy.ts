import AiPerformancePanel from "@/components/dashboard/AiPerformancePanel.vue";
import { mockEmptyAiPerformance } from "../support/apiMocks";

describe("AiPerformancePanel", () => {
  it("pokazuje pusty stan gdy brak logów trace", () => {
    cy.intercept("GET", "**/api/ai/performance", {
      statusCode: 200,
      body: mockEmptyAiPerformance,
    }).as("aiPerformance");

    cy.mount(AiPerformancePanel);

    cy.wait("@aiPerformance");
    cy.contains("AI Performance").should("be.visible");
    cy.contains("Brak logów w traces").should("be.visible");
  });
});
