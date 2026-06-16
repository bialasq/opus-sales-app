import { describe, expect, it } from "vitest";
import { excelService } from "../services/excelService";
import {
  METRICS_UNAVAILABLE,
  PAYMENTS_UNAVAILABLE,
  SALES_UNAVAILABLE,
  VISITS_UNAVAILABLE,
  isSectionAvailable,
  unavailableReason,
} from "../services/workbookSections";
import type { SalesRow, ValidatedExcelWorkbook } from "../types/excelTypes";

const sampleSale: SalesRow = {
  productName: "Widget",
  category: "Test",
  revenue: 150,
  margin: 30,
  quantity: 3,
  customerNip: "5250001001",
  customerName: "ACME Sp. z o.o.",
  salesperson: "Jan Kowalski",
  saleDate: "2025-06-01",
};

const salesOnlyWorkbook: ValidatedExcelWorkbook = {
  sales: [sampleSale],
  visits: [],
  payments: [],
};

describe("workbook z samą sprzedażą (puste wizyty i płatności)", () => {
  it("analyzeSales zwraca metryki sprzedaży", () => {
    const sales = excelService.analyzeSales(salesOnlyWorkbook.sales);
    expect(sales.totalRevenue).toBe(150);
    expect(Object.keys(sales.salesByProduct)).toContain("Widget");
    expect(Object.keys(sales.salesByCustomer)).toContain("5250001001");
  });

  it("analyzeVisits na pustej tablicy nie rzuca — zwraca zera", () => {
    expect(() => excelService.analyzeVisits(salesOnlyWorkbook.visits)).not.toThrow();
    const visits = excelService.analyzeVisits(salesOnlyWorkbook.visits);
    expect(visits.totalVisits).toBe(0);
    expect(visits.conversionRate).toBe(0);
  });

  it("analyzePayments na pustej tablicy nie rzuca — zwraca pusty wynik", () => {
    expect(() =>
      excelService.analyzePayments(salesOnlyWorkbook.payments)
    ).not.toThrow();
    const payments = excelService.analyzePayments(salesOnlyWorkbook.payments);
    expect(payments.overduePayments).toEqual([]);
    expect(payments.totalOutstanding).toBe(0);
  });

  it("analyzeCustomerData buduje profile z samych wierszy sprzedaży", () => {
    const profiles = excelService.analyzeCustomerData(salesOnlyWorkbook);
    expect(Object.keys(profiles)).toContain("5250001001");
    expect(profiles["5250001001"].visitFrequency).toBe("Brak wizyt w danych");
    expect(profiles["5250001001"].totalValue).toBe(150);
  });

  it("calculateMetrics nie dzieli przez zero przy pustych wizytach", () => {
    const sales = excelService.analyzeSales(salesOnlyWorkbook.sales);
    const visits = excelService.analyzeVisits(salesOnlyWorkbook.visits);
    expect(() => excelService.calculateMetrics(visits, sales)).not.toThrow();
    const metrics = excelService.calculateMetrics(visits, sales);
    expect(metrics.revenuePerKilometer).toBe(0);
  });

  it("workbookSections oznacza brak wizyt/płatności jako unavailable", () => {
    const visitAnalysis = salesOnlyWorkbook.visits.length
      ? excelService.analyzeVisits(salesOnlyWorkbook.visits)
      : VISITS_UNAVAILABLE;
    const paymentAnalysis = salesOnlyWorkbook.payments.length
      ? excelService.analyzePayments(salesOnlyWorkbook.payments)
      : PAYMENTS_UNAVAILABLE;
    const salesAnalysis = salesOnlyWorkbook.sales.length
      ? excelService.analyzeSales(salesOnlyWorkbook.sales)
      : SALES_UNAVAILABLE;
    const metrics =
      isSectionAvailable(visitAnalysis) && isSectionAvailable(salesAnalysis)
        ? excelService.calculateMetrics(
            visitAnalysis as ReturnType<typeof excelService.analyzeVisits>,
            salesAnalysis as ReturnType<typeof excelService.analyzeSales>
          )
        : METRICS_UNAVAILABLE;

    expect(isSectionAvailable(visitAnalysis)).toBe(false);
    expect(unavailableReason(visitAnalysis, "")).toMatch(/wizyt/i);

    expect(isSectionAvailable(paymentAnalysis)).toBe(false);
    expect(unavailableReason(paymentAnalysis, "")).toMatch(/płatno/i);

    expect(isSectionAvailable(salesAnalysis)).toBe(true);
    expect(isSectionAvailable(metrics)).toBe(false);
    expect(unavailableReason(metrics, "")).toMatch(/efektywno/i);
  });
});
