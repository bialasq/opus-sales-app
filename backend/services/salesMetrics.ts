import type { ProductRotationMetricRow } from "../shared/api-types";
import { resolveUploadPath } from "../utils/filePathResolver";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const excelService = require("./excelService") as {
  readFile: (filePath: string) => Record<string, Record<string, unknown>[]>;
  analyzeVisits: (visitData: Record<string, unknown>[]) => Record<string, unknown>;
  analyzeSales: (salesData: Record<string, unknown>[]) => {
    salesByProduct: Record<
      string,
      { revenue: number; quantity: number; category?: string; lastSaleDate?: Date }
    >;
    salesByCustomer?: Record<
      string,
      {
        name: string;
        revenue: number;
        orders: number;
        lastOrderDate?: Date;
        products?: Set<string>;
      }
    >;
  };
};

export function extractVisitRows(
  excelData: Record<string, Record<string, unknown>[]>
): Record<string, unknown>[] {
  if (excelData["Wizyty"]?.length) return excelData["Wizyty"];
  if (excelData["Wizyty "]?.length) return excelData["Wizyty "];
  for (const key of Object.keys(excelData)) {
    const rows = excelData[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const first = rows[0] as Record<string, unknown>;
    if ("Opiekun" in first || "Sprzedażowa" in first || "Dystans_km" in first) {
      return rows;
    }
  }
  return [];
}

export function extractSalesRows(
  excelData: Record<string, Record<string, unknown>[]>
): Record<string, unknown>[] {
  if (excelData["Sprzedaż"]?.length) return excelData["Sprzedaż"];
  if (excelData["Sprzedaz"]?.length) return excelData["Sprzedaz"];
  for (const key of Object.keys(excelData)) {
    const rows = excelData[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const first = rows[0] as Record<string, unknown>;
    if (
      "Nazwa_Produktu" in first ||
      "Produkt" in first ||
      "Product" in first
    ) {
      return rows;
    }
  }
  return [];
}

export function readWorkbookFromUploads(filename: string): Record<
  string,
  Record<string, unknown>[]
> {
  const filePath = resolveUploadPath(filename);
  return excelService.readFile(filePath);
}

export function buildProductRotationMetrics(
  filename: string
): ProductRotationMetricRow[] {
  const excelData = readWorkbookFromUploads(filename);
  const rows = extractSalesRows(excelData);
  if (!rows.length) return [];

  const sales = excelService.analyzeSales(rows as Record<string, unknown>[]);
  const byProduct = sales.salesByProduct || {};
  const entries = Object.entries(byProduct);
  if (!entries.length) return [];

  const maxRev = Math.max(...entries.map(([, v]) => v.revenue), 1e-9);
  const maxQty = Math.max(...entries.map(([, v]) => v.quantity), 1e-9);

  return entries.map(([name, v]) => {
    const revNorm = v.revenue / maxRev;
    const qtyNorm = v.quantity / maxQty;
    const rotationRate = Number(((revNorm + qtyNorm) / 2).toFixed(4));
    return {
      id: name,
      name,
      category: v.category || "Inne",
      rotationRate,
      totalQuantity: v.quantity,
      totalValue: v.revenue,
    };
  });
}

export function analyzeSalesFromFile(filename: string) {
  const rows = extractSalesRows(readWorkbookFromUploads(filename));
  return excelService.analyzeSales(rows as Record<string, unknown>[]);
}

export function analyzeVisitsFromFile(filename: string) {
  const rows = extractVisitRows(readWorkbookFromUploads(filename));
  return excelService.analyzeVisits(rows as Record<string, unknown>[]);
}
