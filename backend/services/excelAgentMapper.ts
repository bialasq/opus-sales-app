import type { SheetRole, StoredMapping } from "../shared/api-types";
import type { RawExcelWorkbook } from "./excelRowValidation";
import {
  chooseProvider,
  invokeLlmJsonObject,
} from "./llmInvoke";

type RawRow = Record<string, unknown>;

const MAX_SAMPLE_ROWS = 20;
const MAX_CELL_CHARS = 40;

const REQUIRED_BY_ROLE: Record<Exclude<SheetRole, "ignore">, string[]> = {
  sales: ["productName", "revenue"],
  visits: ["isSalesVisit", "region", "salesperson"],
  payments: ["invoiceNumber", "amount", "dueDate"],
};

const NUMERIC_FIELDS = new Set([
  "revenue",
  "margin",
  "quantity",
  "amount",
  "distanceKm",
  "durationMinutes",
]);

const DATE_FIELDS = new Set(["saleDate", "dueDate", "visitDate"]);

const VALID_ROLES = new Set<SheetRole>([
  "sales",
  "visits",
  "payments",
  "ignore",
]);

const SYSTEM_PROMPT = `Jesteś analitykiem danych. Dostajesz strukturę pliku sprzedażowego (arkusze, nagłówki, próbka wierszy). Zmapuj:
(a) rola każdego arkusza: sales / visits / payments / ignore. Tabele przestawne, podsumowania, raporty zbiorcze = ignore.
(b) dla arkuszy sales: które kolumny odpowiadają polom: productName, category, revenue, margin, quantity, customerNip, customerName, salesperson, saleDate.
   Dla visits: isSalesVisit, region, salesperson, distanceKm, durationMinutes, description, clientNip, customerName, visitDate, city.
   Dla payments: invoiceNumber, customerNip, customerName, amount, dueDate, status, email.
Zwróć WYŁĄCZNIE JSON wg schematu: { "sheetRoles": {<arkusz>: <rola>}, "columns": {<arkusz>: {<poleDomenowe>: <nazwaKolumny|null>}} }.
Pole bez odpowiednika w pliku = null.`;

function stripCodeFences(raw: string): string {
  return raw.replace(/```json\n?|\n?```/gi, "").trim();
}

function trimCell(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > MAX_CELL_CHARS
      ? `${value.slice(0, MAX_CELL_CHARS)}…`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  const s = String(value);
  return s.length > MAX_CELL_CHARS ? `${s.slice(0, MAX_CELL_CHARS)}…` : s;
}

function trimRow(row: RawRow): RawRow {
  const out: RawRow = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = trimCell(value);
  }
  return out;
}

export function buildWorkbookSample(raw: RawExcelWorkbook): unknown {
  const sheets = Object.keys(raw)
    .sort()
    .map((sheetName) => {
      const rows = raw[sheetName] ?? [];
      const headers = collectSheetHeaders(rows);
      const sampleRows = rows
        .filter((row) => Object.keys(row).length > 0)
        .slice(0, MAX_SAMPLE_ROWS)
        .map(trimRow);
      return {
        sheetName,
        headers: [...headers].sort(),
        sampleRows,
      };
    });
  return { sheets };
}

function collectSheetHeaders(rows: RawRow[]): Set<string> {
  const headers = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      headers.add(key);
    }
  }
  return headers;
}

function isParsableNumber(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value);
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return false;
  const n = Number(normalized);
  return Number.isFinite(n);
}

function isParsableDate(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "number" && Number.isFinite(value)) return true;
  const s = String(value).trim();
  if (!s) return false;
  if (!Number.isNaN(Date.parse(s))) return true;
  return /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(s) || /^\d{4}-\d{2}-\d{2}/.test(s);
}

function sampleColumnValues(rows: RawRow[], columnName: string, limit: number): unknown[] {
  const values: unknown[] = [];
  for (const row of rows) {
    if (!(columnName in row)) continue;
    const value = row[columnName];
    if (value == null || value === "") continue;
    values.push(value);
    if (values.length >= limit) break;
  }
  return values;
}

function parseAgentMappingPayload(raw: string): Pick<StoredMapping, "sheetRoles" | "columns"> {
  const cleaned = stripCodeFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Agent zwrócił niepoprawny JSON mapowania struktury pliku");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Agent zwrócił niepoprawny kształt mapowania (oczekiwano obiektu JSON)");
  }

  const obj = parsed as {
    sheetRoles?: unknown;
    columns?: unknown;
  };

  if (!obj.sheetRoles || typeof obj.sheetRoles !== "object" || Array.isArray(obj.sheetRoles)) {
    throw new Error("Agent zwrócił mapowanie bez poprawnego pola sheetRoles");
  }
  if (!obj.columns || typeof obj.columns !== "object" || Array.isArray(obj.columns)) {
    throw new Error("Agent zwrócił mapowanie bez poprawnego pola columns");
  }

  const sheetRoles: Record<string, SheetRole> = {};
  for (const [sheet, role] of Object.entries(obj.sheetRoles)) {
    if (typeof role !== "string" || !VALID_ROLES.has(role as SheetRole)) {
      throw new Error(`Agent zwrócił nieznaną rolę arkusza "${String(role)}" dla "${sheet}"`);
    }
    sheetRoles[sheet] = role as SheetRole;
  }

  const columns: Record<string, Record<string, string | null>> = {};
  for (const [sheet, sheetColumns] of Object.entries(obj.columns)) {
    if (!sheetColumns || typeof sheetColumns !== "object" || Array.isArray(sheetColumns)) {
      throw new Error(`Agent zwrócił niepoprawne kolumny dla arkusza "${sheet}"`);
    }
    columns[sheet] = {};
    for (const [field, columnName] of Object.entries(sheetColumns)) {
      if (columnName == null) {
        columns[sheet][field] = null;
      } else if (typeof columnName === "string") {
        columns[sheet][field] = columnName.trim() || null;
      } else {
        throw new Error(
          `Agent zwrócił niepoprawną nazwę kolumny dla "${sheet}.${field}"`
        );
      }
    }
  }

  return { sheetRoles, columns };
}

/**
 * Twarda walidacja mapowania względem surowego workbooka — odrzuca halucynacje agenta.
 */
export function validateMapping(
  mapping: Pick<StoredMapping, "sheetRoles" | "columns">,
  raw: RawExcelWorkbook
): void {
  for (const [sheetName, role] of Object.entries(mapping.sheetRoles)) {
    if (role === "ignore") continue;

    const rows = raw[sheetName];
    if (!rows) {
      throw new Error(
        `Mapowanie wskazuje arkusz "${sheetName}" (${role}), którego nie ma w pliku`
      );
    }

    const headers = collectSheetHeaders(rows);
    const sheetColumns = mapping.columns[sheetName] ?? {};
    const required = REQUIRED_BY_ROLE[role];

    for (const field of required) {
      const columnName = sheetColumns[field];
      if (!columnName) {
        throw new Error(
          `Arkusz "${sheetName}" (${role}): brak wymaganego mapowania pola "${field}"`
        );
      }
      if (!headers.has(columnName)) {
        throw new Error(
          `Arkusz "${sheetName}": kolumna "${columnName}" (${field}) nie istnieje w nagłówkach pliku`
        );
      }
    }

    for (const [field, columnName] of Object.entries(sheetColumns)) {
      if (!columnName) continue;
      if (!headers.has(columnName)) {
        throw new Error(
          `Arkusz "${sheetName}": kolumna "${columnName}" (${field}) nie istnieje w nagłówkach pliku`
        );
      }

      if (NUMERIC_FIELDS.has(field)) {
        const samples = sampleColumnValues(rows, columnName, 5);
        if (samples.length === 0) {
          throw new Error(
            `Arkusz "${sheetName}": kolumna "${columnName}" (${field}) nie ma wartości w próbce`
          );
        }
        if (!samples.some((value) => isParsableNumber(value))) {
          throw new Error(
            `Arkusz "${sheetName}": kolumna "${columnName}" (${field}) nie zawiera wartości liczbowych w próbce`
          );
        }
      }

      if (DATE_FIELDS.has(field)) {
        const samples = sampleColumnValues(rows, columnName, 5);
        if (samples.length === 0) {
          throw new Error(
            `Arkusz "${sheetName}": kolumna "${columnName}" (${field}) nie ma wartości w próbce`
          );
        }
        if (!samples.some((value) => isParsableDate(value))) {
          throw new Error(
            `Arkusz "${sheetName}": kolumna "${columnName}" (${field}) nie zawiera wartości daty w próbce`
          );
        }
      }
    }
  }
}

export async function mapWorkbookStructure(
  raw: RawExcelWorkbook,
  _organizationId: string
): Promise<StoredMapping> {
  if (chooseProvider() === "none") {
    throw new Error(
      "Nieznany format pliku wymaga analizy AI; włącz klucz LLM w backend/.env"
    );
  }

  const sample = buildWorkbookSample(raw);
  const { raw: llmRaw } = await invokeLlmJsonObject({
    system: SYSTEM_PROMPT,
    user: JSON.stringify(sample, null, 2),
    temperature: 0.1,
    maxTokensOpenAi: 2048,
    maxTokensAnthropic: 2048,
  });

  const parsed = parseAgentMappingPayload(llmRaw);
  validateMapping(parsed, raw);

  return {
    sheetRoles: parsed.sheetRoles,
    columns: parsed.columns,
    createdAt: new Date().toISOString(),
    source: "agent",
  };
}
