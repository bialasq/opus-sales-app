import type { ProductRotationMetricRow } from "../shared/api-types";
import type { SalesRow, ValidatedExcelWorkbook, VisitRow } from "../types/excelTypes";
import { excelService } from "./excelService";
import { readWorkbookFromUpload } from "../utils/uploadReader";

export function extractVisitRows(workbook: ValidatedExcelWorkbook): VisitRow[] {
  return workbook.visits;
}

export function extractSalesRows(workbook: ValidatedExcelWorkbook): SalesRow[] {
  return workbook.sales;
}

export async function readWorkbookFromUploads(
  filename: string,
  organizationId: string
): Promise<ValidatedExcelWorkbook> {
  return readWorkbookFromUpload(filename, organizationId);
}

export async function buildProductRotationMetrics(
  filename: string,
  organizationId: string
): Promise<ProductRotationMetricRow[]> {
  const excelData = await readWorkbookFromUploads(filename, organizationId);
  const rows = extractSalesRows(excelData);
  if (!rows.length) return [];

  const sales = excelService.analyzeSales(rows);
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

export async function analyzeSalesFromFile(
  filename: string,
  organizationId: string
) {
  const rows = extractSalesRows(
    await readWorkbookFromUploads(filename, organizationId)
  );
  return excelService.analyzeSales(rows);
}

export async function analyzeVisitsFromFile(
  filename: string,
  organizationId: string
) {
  const rows = extractVisitRows(
    await readWorkbookFromUploads(filename, organizationId)
  );
  return excelService.analyzeVisits(rows);
}
