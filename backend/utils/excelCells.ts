/**
 * Wspólne narzędzia do odczytu komórek Excela. Wcześniej `cellString`
 * i parser dat były skopiowane w excelService i applyMapping.
 */

/** Bezpieczna konwersja komórki na string ("" dla null/undefined). */
export function cellString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

/**
 * Parser dat Excela. Obsługuje:
 *  - numer seryjny Excela (dni od 1899-12-30),
 *  - dd.mm.yyyy, dd/mm/yyyy, yyyy-mm-dd,
 *  - fallback przez Date.parse.
 * Dla wartości nieparsowalnych zwraca bieżącą datę (zachowanie historyczne).
 */
export function parseExcelDate(dateString: unknown): Date {
  if (!dateString) return new Date();

  if (typeof dateString === "number") {
    // 25569 = dni między 1899-12-30 (epoka Excela) a 1970-01-01 (epoka Unixa).
    return new Date((dateString - 25569) * 86400 * 1000);
  }

  const formats = [
    /(\d{2})\.(\d{2})\.(\d{4})/, // dd.mm.yyyy
    /(\d{2})\/(\d{2})\/(\d{4})/, // dd/mm/yyyy
    /(\d{4})-(\d{2})-(\d{2})/, // yyyy-mm-dd
  ];

  for (const format of formats) {
    const match = dateString.toString().match(format);
    if (match) {
      if (format === formats[2]) {
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      }
      return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    }
  }

  const parsed = Date.parse(cellString(dateString));
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
}
