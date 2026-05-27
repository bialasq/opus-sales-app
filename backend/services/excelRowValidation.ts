import { ValidationError } from "../errors";
import type {
  PaymentRow,
  SalesRow,
  ValidatedExcelWorkbook,
  VisitRow,
} from "../types/excelTypes";

/** Surowy wiersz z XLSX przed walidacją (tylko w tym module). */
type RawRow = Record<string, unknown>;

export type RawExcelWorkbook = Record<string, RawRow[]>;

const VISIT_SHEET_NAMES = new Set(["Wizyty", "Wizyty ", "wizyty"]);
const SALES_SHEET_NAMES = new Set(["Sprzedaż", "Sprzedaz", "sprzedaż"]);
const PAYMENT_SHEET_NAMES = new Set(["Faktury", "faktury"]);

function firstDefined(row: RawRow, keys: string[]): unknown {
  for (const key of keys) {
    if (key in row && row[key] != null && row[key] !== "") {
      return row[key];
    }
  }
  return undefined;
}

function excelRowNumber(rowIndex: number): number {
  return rowIndex + 2;
}

function fail(
  filename: string,
  sheet: string,
  rowIndex: number,
  message: string
): never {
  throw new ValidationError(
    `Plik "${filename}", arkusz "${sheet}", wiersz ${excelRowNumber(rowIndex)}: ${message}`
  );
}

function requireString(
  row: RawRow,
  keys: string[],
  label: string,
  filename: string,
  sheet: string,
  rowIndex: number
): string {
  const value = firstDefined(row, keys);
  if (value == null || String(value).trim() === "") {
    fail(
      filename,
      sheet,
      rowIndex,
      `brak wymaganego pola "${label}" (kolumny: ${keys.join(" / ")})`
    );
  }
  return String(value).trim();
}

function optionalString(row: RawRow, keys: string[], fallback = ""): string {
  const value = firstDefined(row, keys);
  if (value == null || String(value).trim() === "") return fallback;
  return String(value).trim();
}

function requireNumber(
  row: RawRow,
  keys: string[],
  label: string,
  filename: string,
  sheet: string,
  rowIndex: number
): number {
  const value = firstDefined(row, keys);
  if (value == null || String(value).trim() === "") {
    fail(
      filename,
      sheet,
      rowIndex,
      `brak wymaganego pola liczbowego "${label}" (kolumny: ${keys.join(" / ")})`
    );
  }
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) {
    fail(
      filename,
      sheet,
      rowIndex,
      `pole "${label}" musi być liczbą (otrzymano: ${JSON.stringify(value)})`
    );
  }
  return n;
}

function optionalNumber(row: RawRow, keys: string[], fallback = 0): number {
  const value = firstDefined(row, keys);
  if (value == null || String(value).trim() === "") return fallback;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function optionalNip(row: RawRow, keys: string[]): string | null {
  const value = firstDefined(row, keys);
  if (value == null || String(value).trim() === "") return null;
  return String(value).trim();
}

function isVisitRow(row: RawRow): boolean {
  return (
    "Opiekun" in row ||
    "Sprzedażowa" in row ||
    "Sprzedazowa" in row ||
    "Dystans_km" in row
  );
}

function isSalesRow(row: RawRow): boolean {
  return (
    "Nazwa_Produktu" in row ||
    "Produkt" in row ||
    "Product" in row ||
    "Wartość" in row ||
    "Wartosc" in row
  );
}

function isPaymentRow(row: RawRow): boolean {
  return (
    "Nr_Faktury" in row ||
    "Kwota_Brutto" in row ||
    "Termin_Płatności" in row ||
    "Termin_Platnosci" in row
  );
}

function sheetKind(
  sheetName: string,
  sample: RawRow | undefined
): "visits" | "sales" | "payments" | "unknown" {
  if (VISIT_SHEET_NAMES.has(sheetName)) return "visits";
  if (SALES_SHEET_NAMES.has(sheetName)) return "sales";
  if (PAYMENT_SHEET_NAMES.has(sheetName)) return "payments";
  if (!sample) return "unknown";
  if (isVisitRow(sample)) return "visits";
  if (isSalesRow(sample)) return "sales";
  if (isPaymentRow(sample)) return "payments";
  return "unknown";
}

function validateVisitRows(
  rows: RawRow[],
  filename: string,
  sheet: string
): VisitRow[] {
  const out: VisitRow[] = [];
  rows.forEach((row, rowIndex) => {
    if (!row || typeof row !== "object" || Object.keys(row).length === 0) {
      return;
    }
    out.push({
      isSalesVisit: requireString(
        row,
        ["Sprzedażowa", "Sprzedazowa"],
        "Sprzedażowa",
        filename,
        sheet,
        rowIndex
      ),
      region: requireString(
        row,
        ["Województwo", "Wojewodztwo"],
        "Województwo",
        filename,
        sheet,
        rowIndex
      ),
      salesperson: requireString(
        row,
        ["Opiekun"],
        "Opiekun",
        filename,
        sheet,
        rowIndex
      ),
      distanceKm: optionalNumber(row, ["Dystans_km"], 0),
      durationMinutes: optionalNumber(row, ["Czas_Trwania", "Czas trwania"], 0),
      description: optionalString(row, ["Opis"], ""),
      clientNip: optionalNip(row, ["Klient_NIP", "NIP", "Klient_Nip"]),
      customerName: optionalString(row, ["Klient_Nazwa", "Klient"], "Nieznany"),
      visitDate: optionalString(
        row,
        ["Data", "Data_Wizyty", "Data wizyty"],
        ""
      ),
      city: optionalString(
        row,
        ["Miasto", "Miejscowość", "Miejscowosc", "Region"],
        "Nieznane"
      ),
    });
  });
  return out;
}

function validateSalesRows(
  rows: RawRow[],
  filename: string,
  sheet: string
): SalesRow[] {
  const out: SalesRow[] = [];
  rows.forEach((row, rowIndex) => {
    if (!row || typeof row !== "object" || Object.keys(row).length === 0) {
      return;
    }
    out.push({
      productName: requireString(
        row,
        ["Nazwa_Produktu", "Produkt", "Product"],
        "Nazwa_Produktu",
        filename,
        sheet,
        rowIndex
      ),
      category: optionalString(row, ["Kategoria"], "Inne"),
      revenue: requireNumber(
        row,
        ["Wartość", "Wartosc", "Value"],
        "Wartość",
        filename,
        sheet,
        rowIndex
      ),
      margin: optionalNumber(row, ["Marża", "Marza"], 0),
      quantity: optionalNumber(row, ["Ilość", "Ilosc"], 0),
      customerNip: optionalNip(row, ["Klient_NIP", "NIP"]),
      customerName: optionalString(row, ["Klient_Nazwa", "Klient"], "Nieznany"),
      salesperson: (() => {
        const v = optionalString(row, ["Opiekun"], "");
        return v === "" ? null : v;
      })(),
      saleDate: optionalString(
        row,
        ["Data_Sprzedaży", "Data_Sprzedazy", "Data"],
        ""
      ),
    });
  });
  return out;
}

function validatePaymentRows(
  rows: RawRow[],
  filename: string,
  sheet: string
): PaymentRow[] {
  const out: PaymentRow[] = [];
  rows.forEach((row, rowIndex) => {
    if (!row || typeof row !== "object" || Object.keys(row).length === 0) {
      return;
    }
    out.push({
      invoiceNumber: requireString(
        row,
        ["Nr_Faktury", "Numer_Faktury", "Numer faktury"],
        "Nr_Faktury",
        filename,
        sheet,
        rowIndex
      ),
      customerNip: optionalNip(row, ["Klient_NIP", "NIP"]),
      customerName: optionalString(row, ["Klient_Nazwa", "Klient"], "Nieznany"),
      amount: requireNumber(
        row,
        ["Kwota_Brutto", "Kwota_Netto"],
        "Kwota_Brutto",
        filename,
        sheet,
        rowIndex
      ),
      dueDate: requireString(
        row,
        ["Termin_Płatności", "Termin_Platnosci"],
        "Termin_Płatności",
        filename,
        sheet,
        rowIndex
      ),
      status: optionalString(row, ["Status"], "Oczekuje"),
      email: (() => {
        const v = optionalString(row, ["Email"], "");
        return v === "" ? null : v;
      })(),
    });
  });
  return out;
}

export function validateExcelWorkbook(
  raw: RawExcelWorkbook,
  filename: string
): ValidatedExcelWorkbook {
  const visits: VisitRow[] = [];
  const sales: SalesRow[] = [];
  const payments: PaymentRow[] = [];

  for (const [sheetName, rows] of Object.entries(raw)) {
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const sample = rows.find(
      (r) => r && typeof r === "object" && Object.keys(r).length > 0
    );
    const kind = sheetKind(sheetName, sample);

    switch (kind) {
      case "visits":
        visits.push(...validateVisitRows(rows, filename, sheetName));
        break;
      case "sales":
        sales.push(...validateSalesRows(rows, filename, sheetName));
        break;
      case "payments":
        payments.push(...validatePaymentRows(rows, filename, sheetName));
        break;
      default:
        break;
    }
  }

  return { visits, sales, payments };
}

export function isExcelValidationError(err: unknown): err is ValidationError {
  return err instanceof ValidationError;
}
