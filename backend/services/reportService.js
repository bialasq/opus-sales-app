// backend/services/reportService.js
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

class ReportService {
  constructor() {
    this.reportsDir = path.join(__dirname, "..", "reports");
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async generatePDFReport(data, type = "kompleksowy") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `raport_${type}_${timestamp}.pdf`;
    const filepath = path.join(this.reportsDir, filename);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // Nagłówek
      doc.fontSize(20).text("Raport Analityczny", { align: "center" });
      doc
        .fontSize(12)
        .text(new Date().toLocaleDateString("pl-PL"), { align: "center" });
      doc.moveDown();

      // Sekcja wizyt
      if (data.visitAnalysis) {
        this.addVisitSection(doc, data.visitAnalysis);
      }

      // Sekcja sprzedaży
      if (data.salesAnalysis) {
        this.addSalesSection(doc, data.salesAnalysis);
      }

      // Sekcja metryk
      if (data.metrics) {
        this.addMetricsSection(doc, data.metrics);
      }

      // Sekcja płatności
      if (data.paymentAnalysis) {
        this.addPaymentSection(doc, data.paymentAnalysis);
      }

      // Rekomendacje AI
      if (data.aiRecommendations) {
        this.addAIRecommendations(doc, data.aiRecommendations);
      }

      doc.end();

      stream.on("finish", () => {
        resolve({
          filename: filename,
          path: filepath,
          url: `/api/reports/${filename}`,
        });
      });

      stream.on("error", reject);
    });
  }

  addVisitSection(doc, visitAnalysis) {
    doc.addPage();
    doc.fontSize(16).text("Analiza Wizyt", { underline: true });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Łączna liczba wizyt: ${visitAnalysis.totalVisits}`);
    doc.text(`Wizyty sprzedażowe: ${visitAnalysis.salesVisits}`);
    doc.text(`Wizyty niesprzedażowe: ${visitAnalysis.nonSalesVisits}`);
    doc.text(`Wskaźnik konwersji: ${visitAnalysis.conversionRate}%`);
    doc.text(`Łączny dystans: ${visitAnalysis.totalDistance.toFixed(2)} km`);
    doc.moveDown();

    // Wizyty według regionów
    doc.fontSize(14).text("Wizyty według województw:", { underline: true });
    doc.fontSize(11);
    Object.entries(visitAnalysis.visitsByRegion).forEach(([region, data]) => {
      doc.text(`${region}: ${data.total} wizyt (${data.sales} sprzedażowych)`);
    });
    doc.moveDown();

    // Wizyty według handlowców
    doc.fontSize(14).text("Wizyty według handlowców:", { underline: true });
    doc.fontSize(11);
    Object.entries(visitAnalysis.visitsBySalesperson).forEach(
      ([person, data]) => {
        doc.text(
          `${person}: ${data.visits} wizyt, ${data.distance.toFixed(2)} km`
        );
      }
    );
  }

  addSalesSection(doc, salesAnalysis) {
    doc.addPage();
    doc.fontSize(16).text("Analiza Sprzedaży", { underline: true });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(
      `Całkowity przychód: ${this.formatCurrency(salesAnalysis.totalRevenue)}`
    );
    doc.text(
      `Całkowita marża: ${this.formatCurrency(salesAnalysis.totalMargin)}`
    );
    doc.moveDown();

    // Top kategorie
    doc.fontSize(14).text("Sprzedaż według kategorii:", { underline: true });
    doc.fontSize(11);
    const topCategories = Object.entries(salesAnalysis.salesByCategory)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);

    topCategories.forEach(([category, data]) => {
      doc.text(
        `${category}: ${this.formatCurrency(
          data.revenue
        )} (marża: ${this.formatCurrency(data.margin)})`
      );
    });
    doc.moveDown();

    // Klasyfikacja klientów
    doc.fontSize(14).text("Klasyfikacja klientów:", { underline: true });
    doc.fontSize(11);

    const tierCounts = { T1: 0, T2: 0, T3: 0 };
    Object.values(salesAnalysis.customerTiers).forEach((tier) => {
      tierCounts[tier.tier]++;
    });

    doc.text(`Tier 1 (Kluczowi): ${tierCounts.T1} klientów`);
    doc.text(`Tier 2 (Optymalni): ${tierCounts.T2} klientów`);
    doc.text(`Tier 3 (Uzupełniający): ${tierCounts.T3} klientów`);
    doc.moveDown();

    // Produkty bez sprzedaży
    if (
      salesAnalysis.inactiveProducts &&
      salesAnalysis.inactiveProducts.length > 0
    ) {
      doc.fontSize(14).text("Produkty wymagające uwagi:", { underline: true });
      doc.fontSize(11);
      salesAnalysis.inactiveProducts.slice(0, 5).forEach((product) => {
        doc.text(
          `${product.product} - brak sprzedaży od ${product.daysSinceLastSale} dni`
        );
      });
    }
  }

  addMetricsSection(doc, metrics) {
    doc.addPage();
    doc.fontSize(16).text("Kluczowe Metryki", { underline: true });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Przychód na kilometr: ${metrics.revenuePerKilometer} PLN/km`);
    doc.text(`Średni czas wizyty: ${metrics.averageVisitDuration} minut`);
    doc.moveDown();

    // Efektywność handlowców
    doc.fontSize(14).text("Efektywność handlowców:", { underline: true });
    doc.fontSize(11);

    Object.entries(metrics.salespersonEfficiency).forEach(([person, data]) => {
      doc.text(`${person}:`);
      doc.text(
        `  - Wizyty: ${data.visitsCount} (konwersja: ${data.conversionRate}%)`
      );
      doc.text(`  - Przychód: ${this.formatCurrency(data.revenue)}`);
      doc.text(`  - Przychód/wizyta: ${data.revenuePerVisit} PLN`);
      doc.text(`  - Przychód/km: ${data.revenuePerKm} PLN`);
      doc.moveDown(0.5);
    });
  }

  addPaymentSection(doc, paymentAnalysis) {
    doc.addPage();
    doc.fontSize(16).text("Analiza Płatności", { underline: true });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(
      `Łączna kwota zaległości: ${this.formatCurrency(
        paymentAnalysis.totalOutstanding
      )}`
    );
    doc.text(
      `Liczba przeterminowanych faktur: ${paymentAnalysis.overduePayments.length}`
    );
    doc.text(`Średnie opóźnienie: ${paymentAnalysis.averagePaymentDelay} dni`);
    doc.moveDown();

    if (paymentAnalysis.overduePayments.length > 0) {
      doc.fontSize(14).text("Przeterminowane faktury:", { underline: true });
      doc.fontSize(11);

      paymentAnalysis.overduePayments.slice(0, 10).forEach((payment) => {
        doc.text(
          `${payment.invoiceNumber} - ${
            payment.customerName
          }: ${this.formatCurrency(payment.amount)} (${
            payment.daysOverdue
          } dni)`
        );
      });
    }
  }

  addAIRecommendations(doc, recommendations) {
    doc.addPage();
    doc.fontSize(16).text("Rekomendacje AI", { underline: true });
    doc.moveDown();

    doc.fontSize(12);
    recommendations.forEach((rec, index) => {
      doc.text(`${index + 1}. ${rec.title}`, { underline: true });
      doc.fontSize(11);
      doc.text(rec.description);
      if (rec.action) {
        doc.text(`Działanie: ${rec.action}`, { oblique: true });
      }
      doc.moveDown();
      doc.fontSize(12);
    });
  }

  formatCurrency(value) {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: "PLN",
    }).format(value);
  }

  async generateHTMLReport(data, type = "kompleksowy") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `raport_${type}_${timestamp}.html`;
    const filepath = path.join(this.reportsDir, filename);

    let html = `
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Raport Analityczny - ${new Date().toLocaleDateString(
      "pl-PL"
    )}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
        }
        .container {
            background-color: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        h1, h2, h3 {
            color: #2c3e50;
        }
        .metric {
            background-color: #ecf0f1;
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #3498db;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #3498db;
            color: white;
        }
        .alert {
            padding: 15px;
            margin: 10px 0;
            border-radius: 5px;
        }
        .alert-warning {
            background-color: #f39c12;
            color: white;
        }
        .alert-success {
            background-color: #27ae60;
            color: white;
        }
        .chart-container {
            margin: 20px 0;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 5px;
        }
        @media print {
            body {
                background-color: white;
            }
            .container {
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Raport Analityczny</h1>
        <p>Data wygenerowania: ${new Date().toLocaleString("pl-PL")}</p>
        
        ${this.generateHTMLSections(data)}
    </div>
</body>
</html>`;

    fs.writeFileSync(filepath, html);

    return {
      filename: filename,
      path: filepath,
      url: `/api/reports/${filename}`,
    };
  }

  generateHTMLSections(data) {
    let sections = "";

    if (data.visitAnalysis) {
      sections += this.generateVisitHTML(data.visitAnalysis);
    }

    if (data.salesAnalysis) {
      sections += this.generateSalesHTML(data.salesAnalysis);
    }

    if (data.metrics) {
      sections += this.generateMetricsHTML(data.metrics);
    }

    if (data.paymentAnalysis) {
      sections += this.generatePaymentHTML(data.paymentAnalysis);
    }

    if (data.aiRecommendations) {
      sections += this.generateRecommendationsHTML(data.aiRecommendations);
    }

    return sections;
  }

  generateVisitHTML(visitAnalysis) {
    return `
        <h2>Analiza Wizyt</h2>
        <div class="metric">
            <p>Łączna liczba wizyt: <span class="metric-value">${
              visitAnalysis.totalVisits
            }</span></p>
            <p>Wskaźnik konwersji: <span class="metric-value">${
              visitAnalysis.conversionRate
            }%</span></p>
            <p>Łączny dystans: <span class="metric-value">${visitAnalysis.totalDistance.toFixed(
              2
            )} km</span></p>
        </div>
        
        <h3>Wizyty według województw</h3>
        <table>
            <thead>
                <tr>
                    <th>Województwo</th>
                    <th>Liczba wizyt</th>
                    <th>Wizyty sprzedażowe</th>
                    <th>Konwersja</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(visitAnalysis.visitsByRegion)
                  .map(
                    ([region, data]) => `
                    <tr>
                        <td>${region}</td>
                        <td>${data.total}</td>
                        <td>${data.sales}</td>
                        <td>${
                          data.total > 0
                            ? ((data.sales / data.total) * 100).toFixed(1)
                            : 0
                        }%</td>
                    </tr>
                  `
                  )
                  .join("")}
            </tbody>
        </table>
    `;
  }

  generateSalesHTML(salesAnalysis) {
    return `
        <h2>Analiza Sprzedaży</h2>
        <div class="metric">
            <p>Całkowity przychód: <span class="metric-value">${this.formatCurrency(
              salesAnalysis.totalRevenue
            )}</span></p>
            <p>Całkowita marża: <span class="metric-value">${this.formatCurrency(
              salesAnalysis.totalMargin
            )}</span></p>
        </div>
        
        <h3>Top 5 kategorii</h3>
        <table>
            <thead>
                <tr>
                    <th>Kategoria</th>
                    <th>Przychód</th>
                    <th>Marża</th>
                    <th>Ilość</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(salesAnalysis.salesByCategory)
                  .sort((a, b) => b[1].revenue - a[1].revenue)
                  .slice(0, 5)
                  .map(
                    ([category, data]) => `
                    <tr>
                        <td>${category}</td>
                        <td>${this.formatCurrency(data.revenue)}</td>
                        <td>${this.formatCurrency(data.margin)}</td>
                        <td>${data.quantity}</td>
                    </tr>
                  `
                  )
                  .join("")}
            </tbody>
        </table>
        
        ${
          salesAnalysis.inactiveProducts &&
          salesAnalysis.inactiveProducts.length > 0
            ? `
        <div class="alert alert-warning">
            <h4>Produkty wymagające uwagi</h4>
            <ul>
                ${salesAnalysis.inactiveProducts
                  .slice(0, 5)
                  .map(
                    (p) =>
                      `<li>${p.product} - brak sprzedaży od ${p.daysSinceLastSale} dni</li>`
                  )
                  .join("")}
            </ul>
        </div>
        `
            : ""
        }
    `;
  }

  generateMetricsHTML(metrics) {
    return `
        <h2>Kluczowe Metryki</h2>
        <div class="metric">
            <p>Przychód na kilometr: <span class="metric-value">${
              metrics.revenuePerKilometer
            } PLN/km</span></p>
            <p>Średni czas wizyty: <span class="metric-value">${
              metrics.averageVisitDuration
            } minut</span></p>
        </div>
        
        <h3>Efektywność handlowców</h3>
        <table>
            <thead>
                <tr>
                    <th>Handlowiec</th>
                    <th>Liczba wizyt</th>
                    <th>Konwersja</th>
                    <th>Przychód</th>
                    <th>Przychód/km</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(metrics.salespersonEfficiency)
                  .map(
                    ([person, data]) => `
                    <tr>
                        <td>${person}</td>
                        <td>${data.visitsCount}</td>
                        <td>${data.conversionRate}%</td>
                        <td>${this.formatCurrency(data.revenue)}</td>
                        <td>${data.revenuePerKm} PLN</td>
                    </tr>
                  `
                  )
                  .join("")}
            </tbody>
        </table>
    `;
  }

  generatePaymentHTML(paymentAnalysis) {
    return `
        <h2>Analiza Płatności</h2>
        <div class="metric">
            <p>Łączna kwota zaległości: <span class="metric-value">${this.formatCurrency(
              paymentAnalysis.totalOutstanding
            )}</span></p>
            <p>Średnie opóźnienie: <span class="metric-value">${
              paymentAnalysis.averagePaymentDelay
            } dni</span></p>
        </div>
        
        ${
          paymentAnalysis.overduePayments.length > 0
            ? `
        <h3>Przeterminowane faktury</h3>
        <table>
            <thead>
                <tr>
                    <th>Nr faktury</th>
                    <th>Klient</th>
                    <th>Kwota</th>
                    <th>Dni po terminie</th>
                </tr>
            </thead>
            <tbody>
                ${paymentAnalysis.overduePayments
                  .slice(0, 10)
                  .map(
                    (payment) => `
                    <tr>
                        <td>${payment.invoiceNumber}</td>
                        <td>${payment.customerName}</td>
                        <td>${this.formatCurrency(payment.amount)}</td>
                        <td>${payment.daysOverdue}</td>
                    </tr>
                  `
                  )
                  .join("")}
            </tbody>
        </table>
        `
            : "<p>Brak przeterminowanych płatności.</p>"
        }
    `;
  }

  generateRecommendationsHTML(recommendations) {
    return `
        <h2>Rekomendacje AI</h2>
        ${recommendations
          .map(
            (rec, index) => `
            <div class="alert alert-success">
                <h4>${index + 1}. ${rec.title}</h4>
                <p>${rec.description}</p>
                ${
                  rec.action
                    ? `<p><strong>Działanie:</strong> ${rec.action}</p>`
                    : ""
                }
            </div>
        `
          )
          .join("")}
    `;
  }
}

module.exports = new ReportService();
