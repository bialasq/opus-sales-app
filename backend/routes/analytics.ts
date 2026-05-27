import express, { type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { validateBody } from "../middleware/validateRequest";
import {
  InvalidFilenameError,
  resolveUploadPath,
} from "../utils/filePathResolver";
import {
  filenameBodySchema,
  generateReportBodySchema,
  comprehensiveExpertAiBodySchema,
  routeOptimizationBodySchema,
  aiInsightsBodySchema,
} from "../schemas/apiRequests";
import type {
  AnalyticsSummary,
  TestDataInfoResponse,
} from "../types/api";
import { createLogger } from "../services/appLogger";

const log = createLogger("routes/analytics");
import { runComprehensiveExpertAi } from "../services/comprehensiveExpertAi";
import { runAgentInsight, runRouteOptimization } from "../services/aiAgents";
import { generateHybridAIRecommendations } from "../services/recommendationEnricher";
import type { AgentInsightKey } from "../services/aiAgents";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const excelService = require("../services/excelService") as {
  readFile: (p: string) => Record<string, Record<string, unknown>[]>;
  analyzeVisits: (rows: Record<string, unknown>[]) => unknown;
  analyzeSales: (rows: Record<string, unknown>[]) => unknown;
  analyzePayments: (rows: Record<string, unknown>[]) => unknown;
  calculateMetrics: (v: unknown, s: unknown) => unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reportService = require("../services/reportService") as {
  generatePDFReport: (d: unknown) => Promise<unknown>;
  generateHTMLReport: (d: unknown) => Promise<unknown>;
};

const router = express.Router();

function flattenWorkbookRows(
  data: Record<string, Record<string, unknown>[]>
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) {
      for (const row of v) {
        if (row && typeof row === "object") {
          rows.push(row as Record<string, unknown>);
        }
      }
    }
  }
  return rows;
}

router.get("/test-data-info", (_req: Request, res: Response) => {
  try {
    const testFilePath = path.join(__dirname, "..", "dane_testowe.xlsx");
    const exists = fs.existsSync(testFilePath);
    const body: TestDataInfoResponse = {
      testFileExists: exists,
      testFilePath: exists ? testFilePath : null,
      message: exists
        ? "Plik testowy dostępny. Możesz go wgrać do aplikacji."
        : "Uruchom: npm run generate-test-data",
    };
    res.json(body);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error";
    res.status(500).json({ error: msg });
  }
});

router.post(
  "/dashboard",
  validateBody(filenameBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename } = req.body as { filename: string };
      const filePath = resolveUploadPath(filename);
      const workbook = excelService.readFile(filePath);
      const data = flattenWorkbookRows(workbook);

      const kpis = {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        topProducts: {} as Record<string, { quantity: number; value: number }>,
        customerRetention: 0,
        uniqueCustomers: new Set<string>(),
        productsSold: {} as Record<string, { quantity: number; value: number }>,
      };

      data.forEach((row) => {
        const value = parseFloat(
          String(row["Wartosc"] || row["Wartość"] || row["Value"] || 0)
        );
        kpis.totalRevenue += value;
        kpis.totalOrders++;

        const customerId =
          row["ID_Klienta"] || row["CustomerID"] || row["Klient"];
        if (customerId) {
          kpis.uniqueCustomers.add(String(customerId));
        }

        const productName =
          String(
            row["Nazwa_Produktu"] || row["Product"] || row["Produkt"] || "Nieznany"
          );
        if (!kpis.productsSold[productName]) {
          kpis.productsSold[productName] = { quantity: 0, value: 0 };
        }
        kpis.productsSold[productName].quantity += parseInt(
          String(row["Ilosc"] || row["Ilość"] || row["Quantity"] || 1),
          10
        );
        kpis.productsSold[productName].value += value;
      });

      kpis.averageOrderValue =
        kpis.totalOrders > 0 ? kpis.totalRevenue / kpis.totalOrders : 0;

      kpis.customerRetention = Math.round(
        (kpis.uniqueCustomers.size / Math.max(kpis.totalOrders, 1)) * 100
      );

      const topProducts = Object.entries(kpis.productsSold)
        .sort((a, b) => b[1].value - a[1].value)
        .slice(0, 5)
        .map(([name, d]) => ({
          name,
          value: d.value,
          quantity: d.quantity,
        }));

      const out: AnalyticsSummary = {
        totalRevenue: kpis.totalRevenue,
        totalOrders: kpis.totalOrders,
        averageOrderValue: kpis.averageOrderValue,
        topProducts,
        customerRetention: kpis.customerRetention,
        uniqueCustomers: kpis.uniqueCustomers.size,
        rawDataSample: data.slice(0, 5),
      };

      res.json(out);
    } catch (error) {
      if (error instanceof InvalidFilenameError) {
        log.warn("Invalid filename w /analytics/dashboard", { detail: error.message });
        res.status(400).json({ error: "Invalid filename" });
        return;
      }
      log.error("Błąd analizy danych:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({
        error: msg,
        details: "Sprawdź czy plik Excel ma poprawny format",
      });
    }
  }
);

router.post(
  "/comprehensive-analysis",
  validateBody(filenameBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename } = req.body as { filename: string };
      const filePath = resolveUploadPath(filename);
      const excelData = excelService.readFile(filePath);

      const visitAnalysis = excelData["Wizyty"]
        ? excelService.analyzeVisits(excelData["Wizyty"])
        : null;

      const salesAnalysis =
        excelData["Sprzedaż"] || excelData["Sprzedaz"]
          ? excelService.analyzeSales(
              (excelData["Sprzedaż"] || excelData["Sprzedaz"]) as Record<
                string,
                unknown
              >[]
            )
          : null;

      const paymentAnalysis = excelData["Faktury"]
        ? excelService.analyzePayments(excelData["Faktury"])
        : null;

      const metrics =
        visitAnalysis && salesAnalysis
          ? excelService.calculateMetrics(visitAnalysis, salesAnalysis)
          : null;

      const { recommendations: aiRecommendations, meta: aiRecommendationsMeta } =
        await generateHybridAIRecommendations({
          visitAnalysis,
          salesAnalysis,
          paymentAnalysis,
          metrics,
        });

      const analysisResult = {
        visitAnalysis,
        salesAnalysis,
        paymentAnalysis,
        metrics,
        aiRecommendations,
        aiRecommendationsMeta,
        summary: {
          totalRevenue: (salesAnalysis as { totalRevenue?: number })?.totalRevenue || 0,
          totalVisits: (visitAnalysis as { totalVisits?: number })?.totalVisits || 0,
          conversionRate:
            (visitAnalysis as { conversionRate?: number })?.conversionRate || 0,
          overdueAmount:
            (paymentAnalysis as { totalOutstanding?: number })?.totalOutstanding || 0,
          revenuePerKilometer:
            (metrics as { revenuePerKilometer?: string | number })?.revenuePerKilometer ||
            0,
        },
      };

      res.json(analysisResult);
    } catch (error) {
      if (error instanceof InvalidFilenameError) {
        log.warn("Invalid filename w /analytics/comprehensive-analysis", {
          detail: error.message,
        });
        res.status(400).json({ error: "Invalid filename" });
        return;
      }
      log.error("Błąd analizy kompleksowej:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({
        error: msg,
        details:
          "Sprawdź format pliku Excel. Wymagane arkusze: Wizyty, Sprzedaż, Faktury",
      });
    }
  }
);

router.post(
  "/comprehensive-expert-ai",
  validateBody(comprehensiveExpertAiBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { analysisData } = req.body as { analysisData: unknown };
      const result = await runComprehensiveExpertAi(analysisData);
      res.json(result);
    } catch (error) {
      log.error("Błąd comprehensive-expert-ai:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({ error: msg });
    }
  }
);

router.post(
  "/generate-report",
  validateBody(generateReportBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { analysisData, format } = req.body as {
        analysisData: unknown;
        format: "pdf" | "html";
      };

      let report: unknown;
      if (format === "pdf") {
        report = await reportService.generatePDFReport(analysisData);
      } else {
        report = await reportService.generateHTMLReport(analysisData);
      }

      res.json({
        success: true,
        report,
      });
    } catch (error) {
      log.error("Błąd generowania raportu:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({ error: msg });
    }
  }
);

router.post(
  "/route-optimization",
  validateBody(routeOptimizationBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { visitData, priorities } = req.body as {
        visitData: unknown;
        priorities: unknown;
      };
      const { optimizedRoute, meta } = await runRouteOptimization({
        visits: visitData,
        priorities,
      });

      res.json({ optimizedRoute, meta });
    } catch (error) {
      log.error("Błąd optymalizacji tras:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({ error: msg });
    }
  }
);

router.post(
  "/ai-insights",
  validateBody(aiInsightsBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { data, agentType, filename } = req.body as {
        data: unknown;
        agentType: AgentInsightKey;
        filename?: string;
      };

      const result = await runAgentInsight(agentType, data, {
        filename: filename?.trim() || undefined,
      });
      res.json(result);
    } catch (error) {
      log.error("Błąd AI insights:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({ error: msg });
    }
  }
);

module.exports = router;
