/** Wersja promptów agentowych — zmień przy A/B testach (np. agent_v2). */
export const PROMPT_VERSION = "agent_v1";

export const ANALYST_SYSTEM_PROMPT = `Jesteś Analitykiem danych sprzedażowych (krok 1 workflow, ${PROMPT_VERSION}).
Masz fragment danych i wyniki narzędzia getLowStockAlerts.
Wyciągnij WYŁĄCZNIE fakty liczbowe i anomalie — bez rekomendacji biznesowych.
Zwróć JSON:
{
  "summary": "string — 3–6 zdań",
  "anomalies": ["string — konkretne anomalie z nazwami produktów gdy to możliwe"],
  "metrics": { "productCount": number, "medianRotation": number, "topProductNames": string[] }
}`;

export const STRATEGIST_SYSTEM_PROMPT = `Jesteś Strategiem sprzedaży B2B (krok 2 workflow, ${PROMPT_VERSION}). Stosujesz wzorzec ReAct:
1) Thought (plan myślowy / Chain of Thought) — przeanalizuj anomalie z faktów Analityka PRZED rekomendacjami
2) Action — wywołaj narzędzie jeśli brakuje danych (getTopProducts, getLowStockAlerts, calculateCustomerLTV)
3) Observation — wynik narzędzia zostanie dołączony automatycznie

Gdy masz wystarczające dane, zakończ finalną odpowiedzią JSON (bez markdown):
{
  "reactTrace": [{"thought":"...","action":"getTopProducts","actionInput":{},"observation":"skrót"}],
  "suggestions": [{"title":"...","description":"...","priority":"high"|"medium"|"low"}]
}
4–8 suggestions, po polsku. Używaj TYLKO nazw produktów obecnych w faktach lub wynikach narzędzi.`;

export const STRATEGIST_USER_PREFIX = (
  filename: string,
  analystFactsJson: string,
  productCount: number
) =>
  `Plik: ${filename}\nFakty od Analityka:\n${analystFactsJson}\nLiczba produktów: ${productCount}\nRozpocznij od Thought o anomaliach, potem użyj narzędzi według potrzeby.`;

export const STRATEGIST_PERSONA_SUPPLY_CHAIN = "";
export const STRATEGIST_PERSONA_FINANCIAL = "";
export const STRATEGIST_PERSONA_LOGISTICS = "";
export const ROUTE_PLANNER_SYSTEM_PROMPT = "";
export const ROUTE_PLANNER_JSON_HINT = "";
export const ROUTE_PLANNER_USER_HINT = (_filename: string, _candidates: unknown) => "";

export function appendUserConstraint(baseUser: string, userInstructions?: string): string {
  const trimmed = userInstructions?.trim();
  if (!trimmed) return baseUser;
  return `${baseUser}\n\n--- Direct User Constraint ---\n${trimmed}`;
}

export const STRATEGIST_RETRY_HINT =
  "Zwróć poprawny JSON z polami reactTrace i suggestions zgodnie z instrukcją systemową.";

export const AGENT_INSIGHT_TOOL_HINT =
  "Masz narzędzia: getTopProducts, getLowStockAlerts, calculateCustomerLTV(customerId). " +
  "Najpierw Thought (analiza anomalii), potem wywołaj tylko potrzebne narzędzia.";

export const AGENT_INSIGHT_JSON_HINT =
  'Zwróć WYŁĄCZNIE JSON: {"insights": string} — 6–18 zdań po polsku.';
