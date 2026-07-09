import type { mount } from "cypress/vue";

type MountParams = Parameters<typeof mount>;
type MountOptions = MountParams[1];

declare global {
  namespace Cypress {
    interface Chainable {
      mount: typeof mount;
      /** Rejestruje konto przez API (idempotentnie). */
      ensureAccount(
        email: string,
        password: string,
        org: string
      ): Chainable<void>;
      /** Loguje przez formularz UI i kończy na dashboardzie. */
      uiLogin(email: string, password: string): Chainable<void>;
    }
  }
}

export {};
