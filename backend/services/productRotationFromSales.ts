/**
 * Zastępuje brakujące analyzeProductRotation w excelService:
 * agregacja z analyzeSales na arkuszu Sprzedaż/Sprzedaz.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const excelService = require("./excelService") as {
  analyzeSales: (rows: Record<string, unknown>[]) => {
    salesByProduct: Record<
      string,
      { revenue: number; quantity: number; category?: string }
    >;
  };
};

export type ProductRotationEntry = {
  name: string;
  category: string;
  rotationRate: number;
  sales: { quantity: number; value: number }[];
  seasonalTrends?: Record<number, number>;
};

function salesRows(
  excelData: Record<string, Record<string, unknown>[]>
): Record<string, unknown>[] {
  if (excelData["Sprzedaż"]?.length) return excelData["Sprzedaż"];
  if (excelData["Sprzedaz"]?.length) return excelData["Sprzedaz"];
  return [];
}

export function analyzeProductRotationFromWorkbook(
  excelData: Record<string, Record<string, unknown>[]>
): Record<string, ProductRotationEntry> {
  const rows = salesRows(excelData);
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
