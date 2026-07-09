import "./commands";

// "ResizeObserver loop..." to nieszkodliwy błąd rzucany przez Element Plus
// (el-dropdown/el-table przy zmianie layoutu). Nie może wywalać testów.
Cypress.on("uncaught:exception", (err) => {
  if (err.message.includes("ResizeObserver loop")) return false;
  return undefined;
});

// Globalne hooki dla testów E2E — każdy test startuje z czystą sesją.
beforeEach(() => {
  cy.clearLocalStorage();
  cy.clearCookies();
});
