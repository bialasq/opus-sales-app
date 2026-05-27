import express, { type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { validateBody } from "../middleware/validateRequest";
import { InvalidFilenameError } from "../utils/filePathResolver";
import { readWorkbookFromUpload } from "../utils/uploadReader";
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
import { ValidationError } from "../errors";
import { excelService } from "../services/excelService";
import { reportService } from "../services/reportService";
import type { ReportAnalysisPayload } from "../services/reportTypes";
import { runComprehensiveExpertAi } from "../services/comprehensiveExpertAi";
import { runAgentInsight, runRouteOptimization } from "../services/aiAgents";
import { generateHybridAIRecommendations } from "../services/recommendationEnricher";
import type { AgentInsightKey } from "../services/aiAgents";

const log = createLogger("routes/analytics");

const router = express.Router();

function validationErrorResponse(
  res: Response,
  error: ValidationError
): void {
  res.status(error.statusCode).json({ error: error.publicMessage });
}

router.get("/test-data-info", async (_req: Request, res: Response) => {
  try {
    const testFilePath = path.join(__dirname, "..", "dane_testowe.xlsx");
    let exists = false;
    try {
      await fs.promises.access(testFilePath);
      exists = true;
    } catch {
      exists = false;
    }
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
      const workbook = await readWorkbookFromUpload(filename);

      const kpis = {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        topProducts: {} as Record<string, { quantity: number; value: number }>,
        customerRetention: 0,
        uniqueCustomers: new Set<string>(),
        productsSold: {} as Record<string, { quantity: number; value: number }>,
      };

      workbook.sales.forEach((row) => {
        kpis.totalRevenue += row.revenue;
        kpis.totalOrders++;

        if (row.customerNip) {
          kpis.uniqueCustomers.add(row.customerNip);
        }

        const productName = row.productName;
        if (!kpis.productsSold[productName]) {
          kpis.productsSold[productName] = { quantity: 0, value: 0 };
        }
        kpis.productsSold[productName].quantity += Math.round(row.quantity) || 1;
        kpis.productsSold[productName].value += row.revenue;
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
        rawDataSample: workbook.sales.slice(0, 5),
      };

      res.json(out);
    } catch (error) {
      if (error instanceof ValidationError) {
        validationErrorResponse(res, error);
        return;
      }
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
      const excelData = await readWorkbookFromUpload(filename);

      const visitAnalysis = excelData.visits.length
        ? excelService.analyzeVisits(excelData.visits)
        : null;

      const salesAnalysis = excelData.sales.length
        ? excelService.analyzeSales(excelData.sales)
        : null;

      const paymentAnalysis = excelData.payments.length
        ? excelService.analyzePayments(excelData.payments)
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
          totalRevenue: salesAnalysis?.totalRevenue ?? 0,
          totalVisits: visitAnalysis?.totalVisits ?? 0,
          conversionRate: visitAnalysis?.conversionRate ?? 0,
          overdueAmount: paymentAnalysis?.totalOutstanding ?? 0,
          revenuePerKilometer: metrics?.revenuePerKilometer ?? 0,
        },
      };

      res.json(analysisResult);
    } catch (error) {
      if (error instanceof ValidationError) {
        validationErrorResponse(res, error);
        return;
      }
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
        analysisData: ReportAnalysisPayload;
        format: "pdf" | "html";
      };

      const report =
        format === "pdf"
          ? await reportService.generatePDFReport(analysisData)
          : await reportService.generateHTMLReport(analysisData);

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

export default router;
