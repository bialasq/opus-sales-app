import { createHash } from "crypto";
import type { RawExcelWorkbook } from "./excelRowValidation";

type RawRow = Record<string, unknown>;

function headersFromFirstNonEmptyRow(rows: RawRow[]): string[] {
  for (const row of rows) {
    const keys = Object.keys(row).filter((key) => {
      const value = row[key];
      return value != null && value !== "";
    });
    if (keys.length > 0) {
      return keys.sort();
    }
  }
  return [];
}

function buildFingerprintPayload(raw: RawExcelWorkbook): string {
  const sheetNames = Object.keys(raw).sort();
  const parts: string[] = [];

  for (const sheetName of sheetNames) {
    const rows = raw[sheetName] ?? [];
    const headers = headersFromFirstNonEmptyRow(rows);
    parts.push(`${sheetName}:${headers.join("|")}`);
  }

  return parts.join(";");
}

/**
 * Deterministyczny odcisk struktury pliku (arkusze + nagłówki kolumn).
 * Nie uwzględnia wartości komórek ani dat.
 */
export function computeFingerprint(raw: RawExcelWorkbook): string {
  const payload = buildFingerprintPayload(raw);
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}
