/// <reference types="cypress" />

// Rejestruje konto przez API (idempotentnie — 400 gdy już istnieje jest OK).
Cypress.Commands.add(
  "ensureAccount",
  (email: string, password: string, org: string) => {
    cy.request({
      method: "POST",
      url: "/api/auth/register",
      body: { organizationName: org, email, password },
      failOnStatusCode: false,
    });
  }
);

// Loguje przez prawdziwy formularz UI — najbardziej wiarygodnie odtwarza sesję
// (cookie + session-hint ustawia sama aplikacja). Kończy na dashboardzie ("/").
Cypress.Commands.add("uiLogin", (email: string, password: string) => {
  cy.visit("/login");
  cy.get('input[autocomplete="email"]:visible').type(email);
  cy.get('input[autocomplete="current-password"]:visible').type(password);
  cy.contains("button", "Zaloguj").click();
  cy.location("pathname", { timeout: 20000 }).should("eq", "/");
});

export {};
