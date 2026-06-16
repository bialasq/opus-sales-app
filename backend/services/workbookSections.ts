/** Sekcja analizy niedostępna — brak arkusza w pliku. */
export type UnavailableSection = {
  available: false;
  reason: string;
};

export const VISITS_UNAVAILABLE: UnavailableSection = {
  available: false,
  reason: "Brak danych o wizytach w pliku",
};

export const PAYMENTS_UNAVAILABLE: UnavailableSection = {
  available: false,
  reason: "Brak danych o płatnościach w pliku",
};

export const SALES_UNAVAILABLE: UnavailableSection = {
  available: false,
  reason: "Brak danych o sprzedaży w pliku",
};

export const METRICS_UNAVAILABLE: UnavailableSection = {
  available: false,
  reason: "Brak danych do metryk efektywności (wymagane wizyty i sprzedaż)",
};

export function isSectionAvailable(section: unknown): boolean {
  if (section == null || typeof section !== "object") return false;
  if ("available" in section && (section as UnavailableSection).available === false) {
    return false;
  }
  return true;
}

export function unavailableReason(section: unknown, fallback: string): string {
  if (
    section &&
    typeof section === "object" &&
    "available" in section &&
    (section as UnavailableSection).available === false &&
    typeof (section as UnavailableSection).reason === "string"
  ) {
    return (section as UnavailableSection).reason;
  }
  return fallback;
}

/** Do rekomendacji AI — tylko faktyczna analiza, bez wrappera unavailable. */
export function unwrapAnalysisSection<T>(section: T | UnavailableSection): T | null {
  return isSectionAvailable(section) ? (section as T) : null;
}
