const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX =
  /(\+?[0-9]{2,4}[-.\s]?)?(\(?[0-9]{1,4}\)?[-.\s]?){2,4}[0-9]{2,4}/g;
const PESEL_REGEX = /\b\d{11}\b/g;
const NIP_REGEX = /\b\d{10}\b/g;
const IBAN_REGEX = /\b[A-Z]{2}\d{2}\s?(\d{4}\s?){4,6}\d{0,4}\b/g;
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,16}\b/g;

export function scrubPii(text: string): string {
  return text
    .replace(EMAIL_REGEX, "[EMAIL]")
    .replace(PHONE_REGEX, "[PHONE]")
    .replace(PESEL_REGEX, "[PESEL]")
    .replace(NIP_REGEX, "[NIP]")
    .replace(IBAN_REGEX, "[IBAN]")
    .replace(CREDIT_CARD_REGEX, "[CARD]");
}

/**
 * Scrubuje PII z obiektu, przechodząc go REKURENCYJNIE i czyszcząc wyłącznie
 * wartości typu string. Wcześniej funkcja scrubowała cały zserializowany JSON,
 * przez co regexy cyfrowe (telefon/NIP/PESEL) trafiały w liczby i JSON syntax
 * (np. "cost_usd":0.03 → "cost_usd":[PHONE]) i JSON.parse się wywalał.
 * Teraz liczby, klucze i struktura pozostają nienaruszone.
 */
export function scrubObject<T>(obj: T): T {
  return scrubValue(obj) as T;
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") return scrubPii(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = scrubValue(v);
    }
    return out;
  }
  // number, boolean, null, undefined — bez zmian
  return value;
}
