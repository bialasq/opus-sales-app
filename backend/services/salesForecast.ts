import { extractSalesRows, readWorkbookFromUploads } from "./salesMetrics";

export type DailySeriesPoint = { dayIndex: number; dateKey: string; quantity: number; revenue: number };

export type ForecastResult = {
  productName?: string;
  horizonDays: number;
  method: "linear_regression";
  historicalDays: number;
  avgDailyQuantity: number;
  predictedTotalQuantity30d: number;
  predictedDailyQuantity: number;
  trend: "rising" | "falling" | "flat";
  slopePerDay: number;
  confidenceNote: string;
  calendarDaysWithSales?: number;
  calendarGapDaysFilled?: number;
};

function parseSaleDate(row: Record<string, unknown>): Date | null {
  const raw =
    row["Data_Sprzedaży"] ??
    row["Data_Sprzedazy"] ??
    row["Data"] ??
    row["data"];
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === "number") {
    return new Date((raw - 25569) * 86400 * 1000);
  }
  const parsed = Date.parse(String(raw));
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function getProductName(row: Record<string, unknown>): string {
  return String(
    row["Nazwa_Produktu"] ?? row["Produkt"] ?? row["Product"] ?? "Nieznany"
  ).trim();
}

function getQuantity(row: Record<string, unknown>): number {
  const q = row["Ilość"] ?? row["Ilosc"] ?? row["Quantity"] ?? row["quantity"] ?? 0;
  return Number(q) || 0;
}

function getRevenue(row: Record<string, unknown>): number {
  const v =
    row["Wartość"] ??
    row["Wartosc"] ??
    row["Kwota"] ??
    row["Value"] ??
    row["Cena"] ??
    0;
  return Number(v) || 0;
}

/** Prosta regresja liniowa: y = intercept + slope * x */
export function linearRegression(points: { x: number; y: number }[]): {
  intercept: number;
  slope: number;
} {
  const n = points.length;
  if (n === 0) return { intercept: 0, slope: 0 };
  if (n === 1) return { intercept: points[0].y, slope: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) {
    return { intercept: sumY / n, slope: 0 };
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { intercept, slope };
}

function buildDailySeries(
  rows: Record<string, unknown>[],
  productFilter?: string
): DailySeriesPoint[] {
  const byDay = new Map<string, { quantity: number; revenue: number }>();

  for (const row of rows) {
    const name = getProductName(row);
    if (productFilter && name.toLowerCase() !== productFilter.toLowerCase()) {
      continue;
    }
    const d = parseSaleDate(row);
    const key = d
      ? d.toISOString().slice(0, 10)
      : `row-${byDay.size}`;
    const prev = byDay.get(key) || { quantity: 0, revenue: 0 };
    prev.quantity += getQuantity(row);
    prev.revenue += getRevenue(row) || getQuantity(row);
    byDay.set(key, prev);
  }

  const dateKeys = [...byDay.keys()]
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
    .sort();

  if (dateKeys.length === 0) {
    const fallbackKeys = [...byDay.keys()].sort();
    return fallbackKeys.map((dateKey, dayIndex) => ({
      dayIndex,
      dateKey,
      quantity: Math.max(0, byDay.get(dateKey)!.quantity),
      revenue: Math.max(0, byDay.get(dateKey)!.revenue),
    }));
  }

  const parseYmd = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d);
  };
  const formatYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const series: DailySeriesPoint[] = [];
  let gapFilled = 0;
  let dayIndex = 0;
  const cur = parseYmd(dateKeys[0]);
  const endDate = parseYmd(dateKeys[dateKeys.length - 1]);

  for (let d = new Date(cur); d.getTime() <= endDate.getTime(); d.setDate(d.getDate() + 1)) {
    const dateKey = formatYmd(d);
    const bucket = byDay.get(dateKey);
    if (!bucket) gapFilled += 1;
    const quantity = Math.max(0, bucket?.quantity ?? 0);
    const revenue = Math.max(0, bucket?.revenue ?? 0);
    series.push({ dayIndex, dateKey, quantity, revenue });
    dayIndex += 1;
  }

  return series;
}

function seriesGapStats(series: DailySeriesPoint[]): {
  calendarDays: number;
  daysWithSales: number;
  gapDaysFilled: number;
} {
  const calendarDays = series.length;
  const daysWithSales = series.filter((p) => p.quantity > 0).length;
  return {
    calendarDays,
    daysWithSales,
    gapDaysFilled: Math.max(0, calendarDays - daysWithSales),
  };
}

/**
 * Prognoza zapotrzebowania na 30 dni (regresja liniowa na szeregu dziennym).
 */
export function predictFutureSales(
  filename: string,
  options?: { productName?: string; horizonDays?: number }
): ForecastResult {
  const horizonDays = Math.min(Math.max(options?.horizonDays ?? 30, 7), 90);
  const productName = options?.productName?.trim();

  const excelData = readWorkbookFromUploads(filename);
  const rows = extractSalesRows(excelData);
  const series = buildDailySeries(rows, productName || undefined);
  const gapInfo = seriesGapStats(series);

  if (series.length < 2) {
    const totalQty = Math.max(
      0,
      rows.reduce((s, r) => {
        if (productName && getProductName(r).toLowerCase() !== productName.toLowerCase()) {
          return s;
        }
        return s + getQuantity(r);
      }, 0)
    );
    const daily = Math.max(
      0,
      series.length === 1 ? series[0].quantity : totalQty / Math.max(horizonDays, 1)
    );
    const totalPred = Math.max(0, daily * horizonDays);
    return {
      productName: productName || undefined,
      horizonDays,
      method: "linear_regression",
      historicalDays: series.length,
      avgDailyQuantity: Number(daily.toFixed(2)),
      predictedTotalQuantity30d: Number(totalPred.toFixed(0)),
      predictedDailyQuantity: Number(daily.toFixed(2)),
      trend: "flat",
      slopePerDay: 0,
      calendarDaysWithSales: gapInfo.daysWithSales,
      calendarGapDaysFilled: gapInfo.gapDaysFilled,
      confidenceNote:
        "Mało punktów czasowych — użyto średniej z całego pliku (prognoza ≥ 0).",
    };
  }

  const points = series.map((s) => ({ x: s.dayIndex, y: s.quantity }));
  const { intercept, slope } = linearRegression(points);
  const lastX = series[series.length - 1].dayIndex;

  let sumPredicted = 0;
  for (let d = 1; d <= horizonDays; d++) {
    const x = lastX + d;
    const y = Math.max(0, intercept + slope * x);
    sumPredicted += y;
  }
  sumPredicted = Math.max(0, sumPredicted);
  const predictedDaily = Math.max(0, sumPredicted / horizonDays);
  const avgHistorical = Math.max(
    0,
    series.reduce((s, p) => s + p.quantity, 0) / series.length
  );

  let trend: ForecastResult["trend"] = "flat";
  if (slope > avgHistorical * 0.02) trend = "rising";
  else if (slope < -avgHistorical * 0.02) trend = "falling";

  const gapNote =
    gapInfo.gapDaysFilled > 0
      ? ` W kalendarzu uzupełniono ${gapInfo.gapDaysFilled} dni bez sprzedaży (0 szt.).`
      : "";

  return {
    productName: productName || undefined,
    horizonDays,
    method: "linear_regression",
    historicalDays: series.length,
    avgDailyQuantity: Number(avgHistorical.toFixed(2)),
    predictedTotalQuantity30d: Number(sumPredicted.toFixed(0)),
    predictedDailyQuantity: Number(predictedDaily.toFixed(2)),
    trend,
    slopePerDay: Number(slope.toFixed(4)),
    calendarDaysWithSales: gapInfo.daysWithSales,
    calendarGapDaysFilled: gapInfo.gapDaysFilled,
    confidenceNote: `Regresja na ${series.length} dniach kalendarzowych (${gapInfo.daysWithSales} z sprzedażą).${gapNote} Prognoza ≥ 0.`,
  };
}
