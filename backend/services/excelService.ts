import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { createLogger } from "./appLogger";
import type {
  CombinedMetrics,
  CustomerProfilesMap,
  DataStructureInfo,
  PaymentAnalysis,
  PaymentRow,
  SalesAnalysis,
  SalesRow,
  ValidatedExcelWorkbook,
  VisitAnalysis,
  VisitRow,
} from "./excelTypes";
import {
  type RawExcelWorkbook,
  validateExcelWorkbook,
} from "./excelRowValidation";
const log = createLogger("excelService");

function cellString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function parseRawWorkbookBuffer(buffer: Buffer): RawExcelWorkbook {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const data: RawExcelWorkbook = {};

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;
    data[sheetName] = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      worksheet,
      {
        raw: false,
        dateNF: "dd.mm.yyyy",
      }
    );
  }

  return data;
}

class ExcelService {
  readAndValidateBuffer(buffer: Buffer, filename: string): ValidatedExcelWorkbook {
    const raw = parseRawWorkbookBuffer(buffer);
    return validateExcelWorkbook(raw, filename);
  }

  async readFile(filePath: string): Promise<ValidatedExcelWorkbook> {
    const filename = path.basename(filePath);
    try {
      const buffer = await fs.promises.readFile(path.resolve(filePath));
      return this.readAndValidateBuffer(buffer, filename);
    } catch (error: unknown) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "";
      if (code === "ENOENT") {
        throw new Error(`Plik nie istnieje: ${filePath}`);
      }
      log.error("Błąd odczytu pliku Excel:", error);
      throw error;
    }
  }

  readBuffer(buffer: Buffer, filename = "upload.xlsx"): ValidatedExcelWorkbook {
    try {
      return this.readAndValidateBuffer(buffer, filename);
    } catch (error) {
      log.error("Błąd odczytu bufora Excel:", error);
      throw error;
    }
  }

  parseDate(dateString: unknown): Date {
    if (!dateString) return new Date();

    // Obsługa różnych formatów dat
    if (typeof dateString === "number") {
      // Excel serial date
      return new Date((dateString - 25569) * 86400 * 1000);
    }

    // Próbuj różne formaty
    const formats = [
      /(\d{2})\.(\d{2})\.(\d{4})/, // dd.mm.yyyy
      /(\d{2})\/(\d{2})\/(\d{4})/, // dd/mm/yyyy
      /(\d{4})-(\d{2})-(\d{2})/, // yyyy-mm-dd
    ];

    for (const format of formats) {
      const match = dateString.toString().match(format);
      if (match) {
        if (format === formats[2]) {
          // yyyy-mm-dd
          return new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3])
          );
        } else {
          // dd.mm.yyyy lub dd/mm/yyyy
          return new Date(
            Number(match[3]),
            Number(match[2]) - 1,
            Number(match[1])
          );
        }
      }
    }

    // Jeśli nic nie pasuje, spróbuj Date.parse
    const parsed = Date.parse(cellString(dateString));
    return isNaN(parsed) ? new Date() : new Date(parsed);
  }

  analyzeVisits(visitData: VisitRow[]): VisitAnalysis {
    if (!visitData || visitData.length === 0) {
      return {
        totalVisits: 0,
        salesVisits: 0,
        nonSalesVisits: 0,
        visitsByRegion: {},
        visitsBySalesperson: {},
        totalDistance: 0,
        totalTime: 0,
        conversionRate: 0,
        customerPriorities: {},
      };
    }

    const analysis: VisitAnalysis = {
      totalVisits: visitData.length,
      salesVisits: 0,
      nonSalesVisits: 0,
      visitsByRegion: {},
      visitsBySalesperson: {},
      totalDistance: 0,
      totalTime: 0,
      conversionRate: 0,
      customerPriorities: {},
    };

    visitData.forEach((visit) => {
      const isSalesVisit = ["tak", "yes", "t", "1"].includes(
        visit.isSalesVisit.toLowerCase()
      );

      if (isSalesVisit) {
        analysis.salesVisits++;
      } else {
        analysis.nonSalesVisits++;
      }

      const region = visit.region || "Nieznane";
      if (!analysis.visitsByRegion[region]) {
        analysis.visitsByRegion[region] = {
          total: 0,
          sales: 0,
          nonSales: 0,
        };
      }
      analysis.visitsByRegion[region].total++;
      if (isSalesVisit) {
        analysis.visitsByRegion[region].sales++;
      } else {
        analysis.visitsByRegion[region].nonSales++;
      }

      const salesperson = visit.salesperson || "Nieznany";
      if (!analysis.visitsBySalesperson[salesperson]) {
        analysis.visitsBySalesperson[salesperson] = {
          visits: 0,
          salesVisits: 0,
          distance: 0,
          time: 0,
        };
      }
      analysis.visitsBySalesperson[salesperson].visits++;
      if (isSalesVisit) {
        analysis.visitsBySalesperson[salesperson].salesVisits++;
      }

      const distance = visit.distanceKm;
      const duration = visit.durationMinutes;
      analysis.totalDistance += distance;
      analysis.totalTime += duration;
      analysis.visitsBySalesperson[salesperson].distance += distance;
      analysis.visitsBySalesperson[salesperson].time += duration;

      const description = visit.description.toLowerCase();
      const clientNIP = visit.clientNip;

      if (clientNIP) {
        const nipKey = clientNIP;
        if (
          description.includes("zainteresowany") &&
          !description.includes("niezainteresowany")
        ) {
          analysis.customerPriorities[nipKey] = "wysoki";
        } else if (
          description.includes("niezainteresowany") ||
          description.includes("rezygnacja")
        ) {
          analysis.customerPriorities[nipKey] = "niski";
        } else {
          analysis.customerPriorities[nipKey] = "średni";
        }
      }
    });

    // Oblicz wskaźnik konwersji
    analysis.conversionRate =
      analysis.totalVisits > 0
        ? ((analysis.salesVisits / analysis.totalVisits) * 100).toFixed(2)
        : 0;

    return analysis;
  }

  analyzeSales(salesData: SalesRow[]): SalesAnalysis {
    if (!salesData || salesData.length === 0) {
      return {
        totalRevenue: 0,
        totalMargin: 0,
        salesByCategory: {},
        salesByProduct: {},
        salesByCustomer: {},
        salesBySalesperson: {},
        productRotation: {} as Record<string, unknown>,
        customerTiers: {},
        monthlyTrends: {},
        inactiveProducts: [],
      };
    }

    const analysis: SalesAnalysis = {
      totalRevenue: 0,
      totalMargin: 0,
      salesByCategory: {},
      salesByProduct: {},
      salesByCustomer: {},
      salesBySalesperson: {},
      productRotation: {} as Record<string, unknown>,
      customerTiers: {},
      monthlyTrends: {},
      inactiveProducts: [],
    };

    const currentDate = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(currentDate.getMonth() - 2);

    salesData.forEach((sale) => {
      const value = sale.revenue;
      const margin = sale.margin;
      const quantity = Math.round(sale.quantity);
      const category = sale.category;
      const product = sale.productName;
      const customerNIP = sale.customerNip;
      const customerName = sale.customerName;
      const salesperson = sale.salesperson;
      const saleDate = this.parseDate(sale.saleDate);

      analysis.totalRevenue += value;
      analysis.totalMargin += margin;

      // Analiza kategorii
      if (!analysis.salesByCategory[category]) {
        analysis.salesByCategory[category] = {
          revenue: 0,
          margin: 0,
          quantity: 0,
        };
      }
      analysis.salesByCategory[category].revenue += value;
      analysis.salesByCategory[category].margin += margin;
      analysis.salesByCategory[category].quantity += quantity;

      // Analiza produktów
      if (!analysis.salesByProduct[product]) {
        analysis.salesByProduct[product] = {
          revenue: 0,
          quantity: 0,
          lastSaleDate: saleDate,
          category: category,
        };
      }
      analysis.salesByProduct[product].revenue += value;
      analysis.salesByProduct[product].quantity += quantity;
      if (saleDate > analysis.salesByProduct[product].lastSaleDate) {
        analysis.salesByProduct[product].lastSaleDate = saleDate;
      }

      // Analiza klientów
      if (customerNIP) {
        const nipKey = String(customerNIP);
        if (!analysis.salesByCustomer[nipKey]) {
          analysis.salesByCustomer[nipKey] = {
            name: String(customerName),
            revenue: 0,
            orders: 0,
            lastOrderDate: saleDate,
            products: new Set<string>(),
          };
        }
        analysis.salesByCustomer[nipKey].revenue += value;
        analysis.salesByCustomer[nipKey].orders++;
        if (saleDate > analysis.salesByCustomer[nipKey].lastOrderDate) {
          analysis.salesByCustomer[nipKey].lastOrderDate = saleDate;
        }
        analysis.salesByCustomer[nipKey].products.add(String(product));
      }

      // Analiza handlowców
      if (salesperson) {
        const salespersonKey = String(salesperson);
        if (!analysis.salesBySalesperson[salespersonKey]) {
          analysis.salesBySalesperson[salespersonKey] = {
            revenue: 0,
            margin: 0,
            customers: new Set<string>(),
          };
        }
        analysis.salesBySalesperson[salespersonKey].revenue += value;
        analysis.salesBySalesperson[salespersonKey].margin += margin;
        if (customerNIP) {
          analysis.salesBySalesperson[salespersonKey].customers.add(
            String(customerNIP)
          );
        }
      }

      // Trendy miesięczne
      const monthKey = `${saleDate.getFullYear()}-${(saleDate.getMonth() + 1)
        .toString()
        .padStart(2, "0")}`;
      if (!analysis.monthlyTrends[monthKey]) {
        analysis.monthlyTrends[monthKey] = {
          revenue: 0,
          orders: 0,
        };
      }
      analysis.monthlyTrends[monthKey].revenue += value;
      analysis.monthlyTrends[monthKey].orders++;
    });

    // Klasyfikacja klientów (Tier 1, 2, 3)
    this.classifyCustomers(analysis);

    // Identyfikacja produktów bez ponownego zakupu
    this.identifyInactiveProducts(analysis, twoMonthsAgo);

    return analysis;
  }

  classifyCustomers(analysis: SalesAnalysis): void {
    const customers = Object.entries(analysis.salesByCustomer);
    if (customers.length === 0) return;

    const sortedByRevenue = customers.sort(
      (a, b) => b[1].revenue - a[1].revenue
    );

    const totalCustomers = sortedByRevenue.length;
    const tier1Threshold = Math.ceil(totalCustomers * 0.2); // Top 20%
    const tier2Threshold = Math.ceil(totalCustomers * 0.5); // Next 30%

    sortedByRevenue.forEach(([nip, data], index) => {
      if (index < tier1Threshold) {
        analysis.customerTiers[nip] = {
          tier: "T1",
          label: "Kluczowy",
          data: data,
        };
      } else if (index < tier2Threshold) {
        analysis.customerTiers[nip] = {
          tier: "T2",
          label: "Optymalny",
          data: data,
        };
      } else {
        analysis.customerTiers[nip] = {
          tier: "T3",
          label: "Uzupełniający/Potencjalny",
          data: data,
        };
      }
    });
  }

  identifyInactiveProducts(
    analysis: SalesAnalysis,
    thresholdDate: Date
  ): void {
    analysis.inactiveProducts = [];

    Object.entries(analysis.salesByProduct).forEach(([product, data]) => {
      if (data.lastSaleDate < thresholdDate) {
        analysis.inactiveProducts.push({
          product: product,
          category: data.category,
          lastSale: data.lastSaleDate,
          daysSinceLastSale: Math.floor(
            (Date.now() - data.lastSaleDate.getTime()) / (1000 * 60 * 60 * 24)
          ),
        });
      }
    });

    // Sortuj według dni od ostatniej sprzedaży
    analysis.inactiveProducts.sort(
      (a, b) => b.daysSinceLastSale - a.daysSinceLastSale
    );
  }

  analyzePayments(paymentData: PaymentRow[]): PaymentAnalysis {
    if (!paymentData || paymentData.length === 0) {
      return {
        totalOutstanding: 0,
        overduePayments: [],
        paymentsByCustomer: {},
        averagePaymentDelay: 0,
      };
    }

    const analysis: PaymentAnalysis = {
      totalOutstanding: 0,
      overduePayments: [],
      paymentsByCustomer: {},
      averagePaymentDelay: 0,
    };

    const today = new Date();
    let totalDelay = 0;
    let overdueCount = 0;

    paymentData.forEach((payment) => {
      const dueDate = this.parseDate(payment.dueDate);
      const amount = payment.amount;
      const status = payment.status;
      const customerNIP = payment.customerNip;
      const customerName = payment.customerName;

      if (status.toLowerCase() !== "zapłacona" && dueDate < today) {
        const daysOverdue = Math.floor(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        analysis.overduePayments.push({
          invoiceNumber: payment.invoiceNumber,
          customerNIP: customerNIP,
          customerName: customerName,
          amount: amount,
          dueDate: dueDate,
          daysOverdue: daysOverdue,
          email: payment.email,
        });

        analysis.totalOutstanding += amount;
        totalDelay += daysOverdue;
        overdueCount++;
      }

      // Grupuj według klienta
      if (customerNIP) {
        const nipKey = customerNIP;
        if (!analysis.paymentsByCustomer[nipKey]) {
          analysis.paymentsByCustomer[nipKey] = {
            name: customerName,
            total: 0,
            overdue: 0,
            overdueCount: 0,
          };
        }
        analysis.paymentsByCustomer[nipKey].total += amount;
        if (status.toLowerCase() !== "zapłacona" && dueDate < today) {
          analysis.paymentsByCustomer[nipKey].overdue += amount;
          analysis.paymentsByCustomer[nipKey].overdueCount++;
        }
      }
    });

    analysis.averagePaymentDelay =
      overdueCount > 0 ? (totalDelay / overdueCount).toFixed(1) : 0;

    // Sortuj przeterminowane faktury według kwoty
    analysis.overduePayments.sort((a, b) => b.amount - a.amount);

    return analysis;
  }

  calculateMetrics(
    visitAnalysis: VisitAnalysis,
    salesAnalysis: SalesAnalysis
  ): CombinedMetrics {
    const metrics: CombinedMetrics = {
      revenuePerKilometer: 0,
      averageVisitDuration: 0,
      conversionMetrics: {},
      salespersonEfficiency: {},
    };

    // Przychód na kilometr
    if (visitAnalysis.totalDistance > 0) {
      metrics.revenuePerKilometer = (
        salesAnalysis.totalRevenue / visitAnalysis.totalDistance
      ).toFixed(2);
    }

    // Średni czas wizyty
    if (visitAnalysis.totalVisits > 0) {
      metrics.averageVisitDuration = (
        visitAnalysis.totalTime / visitAnalysis.totalVisits
      ).toFixed(1);
    }

    // Efektywność handlowców
    Object.keys(visitAnalysis.visitsBySalesperson).forEach((salesperson) => {
      const visits = visitAnalysis.visitsBySalesperson[salesperson];
      const sales = salesAnalysis.salesBySalesperson[salesperson] || {
        revenue: 0,
        customers: new Set(),
      };

      metrics.salespersonEfficiency[salesperson] = {
        visitsCount: visits.visits,
        salesVisitsCount: visits.salesVisits,
        conversionRate:
          visits.visits > 0
            ? ((visits.salesVisits / visits.visits) * 100).toFixed(1)
            : 0,
        revenue: sales.revenue,
        revenuePerVisit:
          visits.visits > 0 ? (sales.revenue / visits.visits).toFixed(2) : 0,
        revenuePerKm:
          visits.distance > 0
            ? (sales.revenue / visits.distance).toFixed(2)
            : 0,
        averageVisitTime:
          visits.visits > 0 ? (visits.time / visits.visits).toFixed(1) : 0,
        customersCount: sales.customers.size,
      };
    });

    return metrics;
  }

  /**
   * Profile klientów dla widoku /customers/profile — obiekt { [nip]: { name, city, tier, totalOrders, totalValue, visitFrequency } }.
   * @param {Record<string, Record<string, unknown>[]>} workbook — wynik readFile (klucze = nazwy arkuszy)
   */
  analyzeCustomerData(workbook: ValidatedExcelWorkbook): CustomerProfilesMap {
    const profiles: CustomerProfilesMap = {};

    let salesData: SalesRow[] = [...workbook.sales];
    const visitRows = workbook.visits;

    if (salesData.length === 0 && workbook.payments.length > 0) {
      salesData = workbook.payments.map(
        (inv): SalesRow => ({
          productName: inv.invoiceNumber,
          category: "Faktury",
          revenue: inv.amount,
          margin: 0,
          quantity: 1,
          customerNip: inv.customerNip,
          customerName: inv.customerName,
          salesperson: null,
          saleDate: inv.dueDate,
        })
      );
    }

    if (salesData.length === 0) {
      return profiles;
    }

    const salesAnalysis = this.analyzeSales(salesData);
    const { salesByCustomer, customerTiers } = salesAnalysis;

    const cityByNip: Record<string, string> = {};
    visitRows.forEach((v) => {
      if (!v.clientNip) return;
      cityByNip[v.clientNip] = v.city || "Nieznane";
    });

    Object.keys(salesByCustomer).forEach((nip) => {
      const key = String(nip);
      const c = salesByCustomer[nip];
      const tierInfo = customerTiers[nip];
      const tier = tierInfo?.tier || "T3";

      const rowsForCustomer = visitRows.filter((v) => v.clientNip === key);
      let visitFrequency = "Brak wizyt w danych";
      if (rowsForCustomer.length > 0) {
        const dates = rowsForCustomer
          .map((v) => this.parseDate(v.visitDate))
          .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
        const spanMs =
          dates.length >= 2
            ? Math.max(...dates.map((d) => d.getTime())) -
              Math.min(...dates.map((d) => d.getTime()))
            : 0;
        const months = Math.max(spanMs / (1000 * 60 * 60 * 24 * 30), 1);
        const perMonth = rowsForCustomer.length / months;
        if (perMonth >= 2) visitFrequency = "Wysoka";
        else if (perMonth >= 0.5) visitFrequency = "Średnia";
        else visitFrequency = "Niska";
      }

      profiles[key] = {
        name: c.name || "Nieznany",
        city: cityByNip[key] || "Nieznane",
        tier,
        totalOrders: c.orders ?? 0,
        totalValue: c.revenue ?? 0,
        visitFrequency,
      };
    });

    return profiles;
  }

  // Metoda pomocnicza do analizy struktury danych
  analyzeDataStructure(data: SalesRow[]): DataStructureInfo {
    if (!data || data.length === 0) {
      return { columns: [], sampleData: [] };
    }

    const columns: string[] = [
      "productName",
      "category",
      "revenue",
      "margin",
      "quantity",
      "customerNip",
      "customerName",
      "salesperson",
      "saleDate",
    ];
    const sampleData = data.slice(0, 5);

    return { columns, sampleData };
  }
}

export const excelService = new ExcelService();
export type {
  PaymentRow,
  SalesRow,
  ValidatedExcelWorkbook,
  VisitRow,
} from "./excelTypes";
