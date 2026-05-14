// backend/services/excelService.js
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

class ExcelService {
  readFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Plik nie istnieje: ${filePath}`);
      }

      const workbook = XLSX.readFile(filePath);
      const data = {};

      // Odczytaj wszystkie arkusze
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        // Użyj raw: false aby daty były formatowane jako stringi
        data[sheetName] = XLSX.utils.sheet_to_json(worksheet, {
          raw: false,
          dateNF: "dd.mm.yyyy",
        });
      });

      return data;
    } catch (error) {
      console.error("Błąd odczytu pliku Excel:", error);
      throw error;
    }
  }

  parseDate(dateString) {
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
          return new Date(match[1], match[2] - 1, match[3]);
        } else {
          // dd.mm.yyyy lub dd/mm/yyyy
          return new Date(match[3], match[2] - 1, match[1]);
        }
      }
    }

    // Jeśli nic nie pasuje, spróbuj Date.parse
    const parsed = Date.parse(dateString);
    return isNaN(parsed) ? new Date() : new Date(parsed);
  }

  analyzeVisits(visitData) {
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

    const analysis = {
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
      // Analiza typu wizyty
      const isSalesVisit = ["tak", "yes", "t", "1"].includes(
        (visit["Sprzedażowa"] || "").toString().toLowerCase()
      );

      if (isSalesVisit) {
        analysis.salesVisits++;
      } else {
        analysis.nonSalesVisits++;
      }

      // Analiza regionalna
      const region = visit["Województwo"] || "Nieznane";
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

      // Analiza handlowców
      const salesperson = visit["Opiekun"] || "Nieznany";
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

      // Dystans i czas
      const distance = parseFloat(visit["Dystans_km"] || 0);
      const duration = parseFloat(visit["Czas_Trwania"] || 0);
      analysis.totalDistance += distance;
      analysis.totalTime += duration;
      analysis.visitsBySalesperson[salesperson].distance += distance;
      analysis.visitsBySalesperson[salesperson].time += duration;

      // Analiza priorytetów na podstawie opisu
      const description = (visit["Opis"] || "").toLowerCase();
      const clientNIP = visit["Klient_NIP"];

      if (clientNIP) {
        if (
          description.includes("zainteresowany") &&
          !description.includes("niezainteresowany")
        ) {
          analysis.customerPriorities[clientNIP] = "wysoki";
        } else if (
          description.includes("niezainteresowany") ||
          description.includes("rezygnacja")
        ) {
          analysis.customerPriorities[clientNIP] = "niski";
        } else {
          analysis.customerPriorities[clientNIP] = "średni";
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

  analyzeSales(salesData) {
    if (!salesData || salesData.length === 0) {
      return {
        totalRevenue: 0,
        totalMargin: 0,
        salesByCategory: {},
        salesByProduct: {},
        salesByCustomer: {},
        salesBySalesperson: {},
        productRotation: {},
        customerTiers: {},
        monthlyTrends: {},
        inactiveProducts: [],
      };
    }

    const analysis = {
      totalRevenue: 0,
      totalMargin: 0,
      salesByCategory: {},
      salesByProduct: {},
      salesByCustomer: {},
      salesBySalesperson: {},
      productRotation: {},
      customerTiers: {},
      monthlyTrends: {},
      inactiveProducts: [],
    };

    const currentDate = new Date();
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(currentDate.getMonth() - 2);

    salesData.forEach((sale) => {
      const value = parseFloat(sale["Wartość"] || sale["Wartosc"] || 0);
      const margin = parseFloat(sale["Marża"] || sale["Marza"] || 0);
      const quantity = parseInt(sale["Ilość"] || sale["Ilosc"] || 0);
      const category = sale["Kategoria"] || "Inne";
      const product = sale["Nazwa_Produktu"] || "Nieznany";
      const customerNIP = sale["Klient_NIP"];
      const customerName = sale["Klient_Nazwa"] || "Nieznany";
      const salesperson = sale["Opiekun"];
      const saleDate = this.parseDate(
        sale["Data_Sprzedaży"] || sale["Data_Sprzedazy"]
      );

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
        if (!analysis.salesByCustomer[customerNIP]) {
          analysis.salesByCustomer[customerNIP] = {
            name: customerName,
            revenue: 0,
            orders: 0,
            lastOrderDate: saleDate,
            products: new Set(),
          };
        }
        analysis.salesByCustomer[customerNIP].revenue += value;
        analysis.salesByCustomer[customerNIP].orders++;
        if (saleDate > analysis.salesByCustomer[customerNIP].lastOrderDate) {
          analysis.salesByCustomer[customerNIP].lastOrderDate = saleDate;
        }
        analysis.salesByCustomer[customerNIP].products.add(product);
      }

      // Analiza handlowców
      if (salesperson) {
        if (!analysis.salesBySalesperson[salesperson]) {
          analysis.salesBySalesperson[salesperson] = {
            revenue: 0,
            margin: 0,
            customers: new Set(),
          };
        }
        analysis.salesBySalesperson[salesperson].revenue += value;
        analysis.salesBySalesperson[salesperson].margin += margin;
        if (customerNIP) {
          analysis.salesBySalesperson[salesperson].customers.add(customerNIP);
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

  classifyCustomers(analysis) {
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

  identifyInactiveProducts(analysis, thresholdDate) {
    analysis.inactiveProducts = [];

    Object.entries(analysis.salesByProduct).forEach(([product, data]) => {
      if (data.lastSaleDate < thresholdDate) {
        analysis.inactiveProducts.push({
          product: product,
          category: data.category,
          lastSale: data.lastSaleDate,
          daysSinceLastSale: Math.floor(
            (new Date() - data.lastSaleDate) / (1000 * 60 * 60 * 24)
          ),
        });
      }
    });

    // Sortuj według dni od ostatniej sprzedaży
    analysis.inactiveProducts.sort(
      (a, b) => b.daysSinceLastSale - a.daysSinceLastSale
    );
  }

  analyzePayments(paymentData) {
    if (!paymentData || paymentData.length === 0) {
      return {
        totalOutstanding: 0,
        overduePayments: [],
        paymentsByCustomer: {},
        averagePaymentDelay: 0,
      };
    }

    const analysis = {
      totalOutstanding: 0,
      overduePayments: [],
      paymentsByCustomer: {},
      averagePaymentDelay: 0,
    };

    const today = new Date();
    let totalDelay = 0;
    let overdueCount = 0;

    paymentData.forEach((payment) => {
      const dueDate = this.parseDate(
        payment["Termin_Płatności"] || payment["Termin_Platnosci"]
      );
      const amount = parseFloat(payment["Kwota_Brutto"] || 0);
      const status = payment["Status"] || "Oczekuje";
      const customerNIP = payment["Klient_NIP"];
      const customerName = payment["Klient_Nazwa"] || "Nieznany";

      // Sprawdź czy faktura jest przeterminowana
      if (status.toLowerCase() !== "zapłacona" && dueDate < today) {
        const daysOverdue = Math.floor(
          (today - dueDate) / (1000 * 60 * 60 * 24)
        );

        analysis.overduePayments.push({
          invoiceNumber: payment["Nr_Faktury"],
          customerNIP: customerNIP,
          customerName: customerName,
          amount: amount,
          dueDate: dueDate,
          daysOverdue: daysOverdue,
          email: payment["Email"],
        });

        analysis.totalOutstanding += amount;
        totalDelay += daysOverdue;
        overdueCount++;
      }

      // Grupuj według klienta
      if (customerNIP) {
        if (!analysis.paymentsByCustomer[customerNIP]) {
          analysis.paymentsByCustomer[customerNIP] = {
            name: customerName,
            total: 0,
            overdue: 0,
            overdueCount: 0,
          };
        }
        analysis.paymentsByCustomer[customerNIP].total += amount;
        if (status.toLowerCase() !== "zapłacona" && dueDate < today) {
          analysis.paymentsByCustomer[customerNIP].overdue += amount;
          analysis.paymentsByCustomer[customerNIP].overdueCount++;
        }
      }
    });

    analysis.averagePaymentDelay =
      overdueCount > 0 ? (totalDelay / overdueCount).toFixed(1) : 0;

    // Sortuj przeterminowane faktury według kwoty
    analysis.overduePayments.sort((a, b) => b.amount - a.amount);

    return analysis;
  }

  calculateMetrics(visitAnalysis, salesAnalysis) {
    const metrics = {
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
  analyzeCustomerData(workbook) {
    const profiles = {};
    if (!workbook || typeof workbook !== "object") {
      return profiles;
    }

    const salesRows =
      workbook["Sprzedaż"] || workbook["Sprzedaz"] || workbook["sprzedaż"] || [];
    const visitRows = workbook["Wizyty"] || workbook["wizyty"] || [];
    const invoiceRows = workbook["Faktury"] || workbook["faktury"] || [];

    let salesData = Array.isArray(salesRows) ? [...salesRows] : [];

    if (salesData.length === 0 && invoiceRows.length > 0) {
      salesData = invoiceRows.map((inv) => ({
        Wartość: inv["Kwota_Brutto"] ?? inv["Kwota_Netto"] ?? 0,
        Marża: 0,
        Ilość: 1,
        Kategoria: "Faktury",
        Nazwa_Produktu: inv["Numer_Faktury"] || inv["Numer faktury"] || "Faktura",
        Klient_NIP: inv["Klient_NIP"],
        Klient_Nazwa: inv["Klient_Nazwa"] || "Nieznany",
        Opiekun: inv["Opiekun"],
        Data_Sprzedaży:
          inv["Data_Sprzedaży"] ||
          inv["Data_Sprzedazy"] ||
          inv["Data_Wystawienia"] ||
          inv["Data wystawienia"] ||
          inv["Data"],
      }));
    }

    if (salesData.length === 0) {
      return profiles;
    }

    const salesAnalysis = this.analyzeSales(salesData);
    const { salesByCustomer, customerTiers } = salesAnalysis;

    /** @type {Record<string, string>} */
    const cityByNip = {};
    (Array.isArray(visitRows) ? visitRows : []).forEach((v) => {
      const nip = v["Klient_NIP"] ?? v["NIP"] ?? v["Klient_Nip"];
      if (nip == null || nip === "") return;
      const key = String(nip);
      const city =
        v["Miasto"] ||
        v["Miejscowość"] ||
        v["Miejscowosc"] ||
        v["Region"] ||
        "Nieznane";
      cityByNip[key] = String(city);
    });

    const visitNipKey = (v) =>
      String(v["Klient_NIP"] ?? v["NIP"] ?? v["Klient_Nip"] ?? "");

    Object.keys(salesByCustomer).forEach((nip) => {
      const key = String(nip);
      const c = salesByCustomer[nip];
      const tierInfo = customerTiers[nip];
      const tier = tierInfo?.tier || "T3";

      const rowsForCustomer = (Array.isArray(visitRows) ? visitRows : []).filter(
        (v) => visitNipKey(v) === key
      );
      let visitFrequency = "Brak wizyt w danych";
      if (rowsForCustomer.length > 0) {
        const dates = rowsForCustomer
          .map((v) =>
            this.parseDate(
              v["Data"] || v["Data_Wizyty"] || v["Data wizyty"] || ""
            )
          )
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
  analyzeDataStructure(data) {
    if (!data || data.length === 0) {
      return { columns: [], sampleData: [] };
    }

    const columns = Object.keys(data[0]);
    const sampleData = data.slice(0, 5);

    return { columns, sampleData };
  }
}

module.exports = new ExcelService();
