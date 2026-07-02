import type { SheetRole, StoredMapping } from "../shared/api-types";
import type {
  PaymentRow,
  SalesRow,
  ValidatedExcelWorkbook,
  VisitRow,
} from "../types/excelTypes";
import type { RawExcelWorkbook } from "./excelRowValidation";

type RawRow = Record<string, unknown>;

import { parseExcelDate } from "../utils/excelCells";

function cellValue(row: RawRow, columnName: string | null | undefined): unknown {
  if (!columnName) return undefined;
  return row[columnName];
}

function optionalString(row: RawRow, columnName: string | null | undefined): string {
  const value = cellValue(row, columnName);
  if (value == null || String(value).trim() === "") return "";
  return String(value).trim();
}

function optionalNumber(
  row: RawRow,
  columnName: string | null | undefined,
  fallback = 0
): number {
  const value = cellValue(row, columnName);
  if (value == null || String(value).trim() === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const normalized = String(value).trim().replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function optionalNip(
  row: RawRow,
  columnName: string | null | undefined
): string | null {
  const value = optionalString(row, columnName);
  return value === "" ? null : value;
}

function formatDateCell(value: unknown): string {
  if (value == null || String(value).trim() === "") return "";
  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value.trim())) {
    return value.trim();
  }
  const date = parseExcelDate(value);
  if (Number.isNaN(date.getTime())) return String(value).trim();
  return date.toISOString().slice(0, 10);
}

function isEmptyRow(row: RawRow | undefined): boolean {
  return !row || typeof row !== "object" || Object.keys(row).length === 0;
}

function mapSalesRow(row: RawRow, columns: Record<string, string | null>): SalesRow {
  const salesperson = optionalString(row, columns.salesperson);
  return {
    productName: optionalString(row, columns.productName) || "Nieznany",
    category: optionalString(row, columns.category) || "Inne",
    revenue: optionalNumber(row, columns.revenue, 0),
    margin: optionalNumber(row, columns.margin, 0),
    quantity: optionalNumber(row, columns.quantity, 0),
    customerNip: optionalNip(row, columns.customerNip),
    customerName: optionalString(row, columns.customerName) || "Nieznany",
    salesperson: salesperson === "" ? null : salesperson,
    saleDate: columns.saleDate
      ? formatDateCell(cellValue(row, columns.saleDate))
      : "",
  };
}

function mapVisitRow(row: RawRow, columns: Record<string, string | null>): VisitRow {
  return {
    isSalesVisit: optionalString(row, columns.isSalesVisit) || "Nie",
    region: optionalString(row, columns.region) || "Nieznane",
    salesperson: optionalString(row, columns.salesperson) || "Nieznany",
    distanceKm: optionalNumber(row, columns.distanceKm, 0),
    durationMinutes: optionalNumber(row, columns.durationMinutes, 0),
    description: optionalString(row, columns.description),
    clientNip: optionalNip(row, columns.clientNip),
    customerName: optionalString(row, columns.customerName) || "Nieznany",
    visitDate: columns.visitDate
      ? formatDateCell(cellValue(row, columns.visitDate))
      : "",
    city: optionalString(row, columns.city) || "Nieznane",
  };
}

function mapPaymentRow(row: RawRow, columns: Record<string, string | null>): PaymentRow {
  const email = optionalString(row, columns.email);
  return {
    invoiceNumber: optionalString(row, columns.invoiceNumber) || "BRAK",
    customerNip: optionalNip(row, columns.customerNip),
    customerName: optionalString(row, columns.customerName) || "Nieznany",
    amount: optionalNumber(row, columns.amount, 0),
    dueDate: columns.dueDate
      ? formatDateCell(cellValue(row, columns.dueDate))
      : "",
    status: optionalString(row, columns.status) || "Oczekuje",
    email: email === "" ? null : email,
  };
}

function mapRowsForRole<T>(
  raw: RawExcelWorkbook,
  sheetName: string,
  role: Exclude<SheetRole, "ignore">,
  columns: Record<string, string | null> | undefined,
  mapper: (row: RawRow, cols: Record<string, string | null>) => T
): T[] {
  if (!columns) return [];
  const rows = raw[sheetName] ?? [];
  const out: T[] = [];
  for (const row of rows) {
    if (isEmptyRow(row)) continue;
    out.push(mapper(row, columns));
  }
  return out;
}

export function applyMapping(
  raw: RawExcelWorkbook,
  mapping: StoredMapping
): ValidatedExcelWorkbook {
  const visits: VisitRow[] = [];
  const sales: SalesRow[] = [];
  const payments: PaymentRow[] = [];

  for (const [sheetName, role] of Object.entries(mapping.sheetRoles)) {
    if (role === "ignore") continue;
    const sheetColumns = mapping.columns[sheetName] ?? {};

    switch (role) {
      case "sales":
        sales.push(
          ...mapRowsForRole(raw, sheetName, "sales", sheetColumns, mapSalesRow)
        );
        break;
      case "visits":
        visits.push(
          ...mapRowsForRole(raw, sheetName, "visits", sheetColumns, mapVisitRow)
        );
        break;
      case "payments":
        payments.push(
          ...mapRowsForRole(
            raw,
            sheetName,
            "payments",
            sheetColumns,
            mapPaymentRow
          )
        );
        break;
    }
  }

  return { visits, sales, payments };
}
