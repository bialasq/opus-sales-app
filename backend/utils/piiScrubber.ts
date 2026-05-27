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

export function scrubObject<T>(obj: T): T {
  return JSON.parse(scrubPii(JSON.stringify(obj))) as T;
}
