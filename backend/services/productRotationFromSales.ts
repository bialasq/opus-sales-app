/**
 * Zastępuje brakujące analyzeProductRotation w excelService:
 * agregacja z analyzeSales na arkuszu Sprzedaż/Sprzedaz.
 */
import { excelService } from "./excelService";
import type { SalesRow, ValidatedExcelWorkbook } from "../types/excelTypes";

export type ProductRotationEntry = {
  name: string;
  category: string;
  rotationRate: number;
  sales: { quantity: number; value: number }[];
  seasonalTrends?: Record<number, number>;
};

export function analyzeProductRotationFromWorkbook(
  excelData: ValidatedExcelWorkbook
): Record<string, ProductRotationEntry> {
  const rows: SalesRow[] = excelData.sales;
  if (!rows.length) return {};

  const sales = excelService.analyzeSales(rows);
  const by = sales.salesByProduct || {};
  const entries = Object.entries(by);
  if (!entries.length) return {};

  const maxRev = Math.max(...entries.map(([, v]) => v.revenue), 1e-9);
  const maxQty = Math.max(...entries.map(([, v]) => v.quantity), 1e-9);

  const out: Record<string, ProductRotationEntry> = {};
  for (const [name, v] of entries) {
    const revNorm = v.revenue / maxRev;
    const qtyNorm = v.quantity / maxQty;
    const rotationRate = Number(((revNorm + qtyNorm) / 2).toFixed(4));
    out[name] = {
      name,
      category: v.category || "Inne",
      rotationRate,
      sales: [{ quantity: v.quantity, value: v.revenue }],
    };
  }
  return out;
}
