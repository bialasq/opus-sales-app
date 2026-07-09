const PASSWORD = "haslo12345";
const email = `e2e-upl-${Date.now()}@opus.test`;

describe("Upload pliku Excel — live stack", () => {
  before(() => {
    cy.ensureAccount(email, PASSWORD, "E2E Upload Org");
  });

  beforeEach(() => {
    cy.uiLogin(email, PASSWORD);
  });

  it("wgrywa dane_testowe.xlsx i pokazuje plik na liście plików", () => {
    cy.contains("Wgraj Excel").should("be.visible");

    // el-upload trzyma ukryty <input type=file> — wybieramy plik z force.
    cy.get('input[type="file"]')
      .first()
      .selectFile("cypress/fixtures/dane_testowe.xlsx", { force: true });

    cy.contains("Plik został wgrany", { timeout: 20000 }).should("be.visible");

    cy.visit("/files");
    cy.contains("dane_testowe.xlsx", { timeout: 15000 }).should("be.visible");
  });
});
