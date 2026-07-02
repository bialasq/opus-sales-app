/**
 * Wspólne narzędzia do wydobywania JSON-a z odpowiedzi LLM.
 * Modele często opakowują JSON w bloki ```json … ``` albo dokładają prozę —
 * wcześniej ta sama logika była skopiowana w 6+ serwisach.
 */

/** Usuwa opakowanie ```json … ``` (case-insensitive) i przycina białe znaki. */
export function stripJsonFences(raw: string): string {
  return raw.replace(/```json\n?|\n?```/gi, "").trim();
}

/**
 * Zwraca sam obiekt JSON: zdejmuje fence'y, a gdy model doda prozę dookoła,
 * wycina fragment od pierwszego `{` do ostatniego `}`. Dla odpowiedzi, które
 * mają być pojedynczym obiektem (nie tablicą) — odporne na komentarze modelu.
 */
export function extractJsonObject(raw: string): string {
  const fenced = stripJsonFences(raw);
  const first = fenced.indexOf("{");
  const last = fenced.lastIndexOf("}");
  return first !== -1 && last > first ? fenced.slice(first, last + 1) : fenced;
}
