import express, { type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { validateBody } from "../middleware/validateRequest";
import { requireOrg } from "../middleware/session";
import { FileNotOwnedError } from "../services/fileOwnership";
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
import {
  METRICS_UNAVAILABLE,
  PAYMENTS_UNAVAILABLE,
  SALES_UNAVAILABLE,
  VISITS_UNAVAILABLE,
  isSectionAvailable,
  unwrapAnalysisSection,
} from "../services/workbookSections";
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
  requireOrg,
  validateBody(filenameBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename } = req.body as { filename: string };
      const organizationId = req.auth!.organizationId;
      const workbook = await readWorkbookFromUpload(filename, organizationId);

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
      if (error instanceof FileNotOwnedError) {
        res.status(404).json({ error: "Plik nie istnieje" });
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
  requireOrg,
  validateBody(filenameBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename } = req.body as { filename: string };
      const organizationId = req.auth!.organizationId;
      const excelData = await readWorkbookFromUpload(filename, organizationId);

      const visitAnalysis = excelData.visits.length
        ? excelService.analyzeVisits(excelData.visits)
        : VISITS_UNAVAILABLE;

      const salesAnalysis = excelData.sales.length
        ? excelService.analyzeSales(excelData.sales)
        : SALES_UNAVAILABLE;

      const paymentAnalysis = excelData.payments.length
        ? excelService.analyzePayments(excelData.payments)
        : PAYMENTS_UNAVAILABLE;

      const metrics =
        isSectionAvailable(visitAnalysis) && isSectionAvailable(salesAnalysis)
          ? excelService.calculateMetrics(
              visitAnalysis as ReturnType<typeof excelService.analyzeVisits>,
              salesAnalysis as ReturnType<typeof excelService.analyzeSales>
            )
          : METRICS_UNAVAILABLE;

      const { recommendations: aiRecommendations, meta: aiRecommendationsMeta } =
        await generateHybridAIRecommendations({
          visitAnalysis: unwrapAnalysisSection(visitAnalysis),
          salesAnalysis: unwrapAnalysisSection(salesAnalysis),
          paymentAnalysis: unwrapAnalysisSection(paymentAnalysis),
          metrics: unwrapAnalysisSection(metrics),
        });

      const visitData = isSectionAvailable(visitAnalysis)
        ? (visitAnalysis as ReturnType<typeof excelService.analyzeVisits>)
        : null;
      const salesData = isSectionAvailable(salesAnalysis)
        ? (salesAnalysis as ReturnType<typeof excelService.analyzeSales>)
        : null;
      const paymentData = isSectionAvailable(paymentAnalysis)
        ? (paymentAnalysis as ReturnType<typeof excelService.analyzePayments>)
        : null;
      const metricsData = isSectionAvailable(metrics)
        ? (metrics as ReturnType<typeof excelService.calculateMetrics>)
        : null;

      const analysisResult = {
        visitAnalysis,
        salesAnalysis,
        paymentAnalysis,
        metrics,
        aiRecommendations,
        aiRecommendationsMeta,
        summary: {
          totalRevenue: salesData?.totalRevenue ?? 0,
          totalVisits: visitData?.totalVisits ?? 0,
          conversionRate: visitData?.conversionRate ?? 0,
          overdueAmount: paymentData?.totalOutstanding ?? 0,
          revenuePerKilometer: metricsData?.revenuePerKilometer ?? 0,
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
      if (error instanceof FileNotOwnedError) {
        res.status(404).json({ error: "Plik nie istnieje" });
        return;
      }
      log.error("Błąd analizy kompleksowej:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({
        error: msg,
        details:
          "Sprawdź format pliku Excel. Wymagany co najmniej arkusz Sprzedaż.",
      });
    }
  }
);

router.post(
  "/comprehensive-expert-ai",
  requireOrg,
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
  requireOrg,
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
  requireOrg,
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
  requireOrg,
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
        organizationId: req.auth!.organizationId,
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
