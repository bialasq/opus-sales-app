const PASSWORD = "haslo12345";
const email = `e2e-nav-${Date.now()}@opus.test`;

describe("Nawigacja po aplikacji — live stack", () => {
  before(() => {
    cy.ensureAccount(email, PASSWORD, "E2E Nav Org");
  });

  beforeEach(() => {
    cy.uiLogin(email, PASSWORD);
  });

  it("przechodzi po sidebarze i pokazuje baner demo w Anomaliach", () => {
    cy.contains("a", "Produkty").click();
    cy.location("pathname").should("eq", "/products");
    cy.title().should("include", "Analiza produktów");

    cy.contains("a", "Anomalie").click();
    cy.location("pathname").should("eq", "/anomalies");
    cy.contains("Dane demonstracyjne").should("be.visible");

    cy.contains("a", "Płatności").click();
    cy.location("pathname").should("eq", "/payments");
    cy.title().should("include", "Monitoring płatności");
  });

  it("panel Administracja jest dostępny (rola OWNER)", () => {
    cy.contains("a", "Administracja").click();
    cy.location("pathname").should("eq", "/admin");
    cy.contains("Budżet AI").should("be.visible");
  });
});
