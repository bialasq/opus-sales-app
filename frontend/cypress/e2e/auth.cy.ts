const PASSWORD = "haslo12345";

describe("Auth — live stack", () => {
  it("niezalogowany użytkownik jest przekierowany na /login", () => {
    cy.visit("/");
    cy.location("pathname").should("include", "/login");
    cy.contains("Logowanie").should("be.visible");
  });

  describe("rejestracja przez UI", () => {
    const email = `e2e-reg-${Date.now()}@opus.test`;

    it("rejestruje organizację i ląduje na dashboardzie", () => {
      cy.visit("/login");
      cy.contains(".el-tabs__item", "Rejestracja").click();

      cy.get('input[autocomplete="organization"]:visible').type("E2E Reg Org");
      cy.get('input[autocomplete="email"]:visible').type(email);
      cy.get('input[autocomplete="new-password"]:visible').type(PASSWORD);
      cy.contains("button", "Załóż konto").click();

      cy.location("pathname", { timeout: 20000 }).should("eq", "/");
      cy.contains("Wgraj Excel").should("be.visible");
    });
  });

  describe("sesja i wylogowanie", () => {
    const email = `e2e-sess-${Date.now()}@opus.test`;

    before(() => {
      cy.ensureAccount(email, PASSWORD, "E2E Sess Org");
    });

    it("logowanie przez UI działa i utrzymuje sesję po przeładowaniu", () => {
      cy.uiLogin(email, PASSWORD);
      // Reload: access token żyje tylko w pamięci — sesja wraca z httpOnly cookie.
      cy.reload();
      cy.location("pathname").should("eq", "/");
      cy.contains("Wgraj Excel").should("be.visible");
    });

    it("wylogowuje i przekierowuje na /login", () => {
      cy.uiLogin(email, PASSWORD);
      cy.get(".el-dropdown").first().click();
      cy.contains(".el-dropdown-menu__item", "Wyloguj").click();
      cy.location("pathname", { timeout: 10000 }).should("include", "/login");
    });
  });
});
