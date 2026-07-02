import express, { type Request, type Response } from "express";
import { validateBody } from "../middleware/validateRequest";
import { requireOrg } from "../middleware/session";
import { asyncHandler } from "../utils/asyncHandler";
import { readWorkbookFromUpload } from "../utils/uploadReader";
import { filenameBodySchema, promotionsBodySchema } from "../schemas/apiRequests";
import type { Product, ProductAnalysisResponse } from "../types/api";
import { analyzeProductRotationFromWorkbook } from "../services/productRotationFromSales";

const router = express.Router();

router.post(
  "/analysis",
  requireOrg,
  validateBody(filenameBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { filename } = req.body as { filename: string };
    const organizationId = req.auth!.organizationId;
    const data = await readWorkbookFromUpload(filename, organizationId);

    const productAnalysis = analyzeProductRotationFromWorkbook(data);

    const products: Product[] = Object.entries(productAnalysis).map(
      ([id, product]) => ({
        id,
        name: product.name,
        category: product.category || "Inne",
        // Stan magazynowy nie wynika z danych sprzedaży — nie zmyślamy go.
        stock: null,
        minStock: null,
        rotationRate: product.rotationRate || 0,
        sales: product.sales,
        totalQuantity: product.sales.reduce((sum, sale) => sum + sale.quantity, 0),
        totalValue: product.sales.reduce((sum, sale) => sum + sale.value, 0),
      })
    );

    products.sort((a, b) => b.totalValue - a.totalValue);

    const seasonalTrends: ProductAnalysisResponse["seasonalTrends"] = {};
    Object.entries(productAnalysis).forEach(([, product]) => {
      if (product.seasonalTrends) {
        seasonalTrends[product.name] = product.seasonalTrends;
      }
    });

    const out: ProductAnalysisResponse = {
      products,
      seasonalTrends,
      totalProducts: Object.keys(productAnalysis).length,
      categories: [...new Set(products.map((p) => p.category))],
      stockDataAvailable: false,
    };

    res.json(out);
  })
);

router.post(
  "/promotions",
  requireOrg,
  validateBody(promotionsBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { products, seasonalData } = req.body as {
      products?: Array<{
        id?: string;
        name: string;
        rotationRate: number;
        stock?: number | null;
        minStock?: number | null;
      }>;
      seasonalData?: Record<string, number[]>;
    };
    const currentMonth = new Date().getMonth();
    const suggestions: Array<{
      productId?: string;
      productName: string;
      recommendation: string;
      reason: string;
      priority: "high" | "medium" | "low";
    }> = [];

    if (products && Array.isArray(products)) {
      products.forEach((product) => {
        if (product.rotationRate < 0.3) {
          suggestions.push({
            productId: product.id,
            productName: product.name,
            recommendation: "Sugerowana promocja -30%",
            reason: "Bardzo niska rotacja produktu",
            priority: "high",
          });
        }

        if (seasonalData && seasonalData[product.name]) {
          const monthlyAvg = seasonalData[product.name][currentMonth] || 0;
          const yearlyAvg =
            seasonalData[product.name].reduce((a, b) => a + b, 0) / 12;

          if (monthlyAvg < yearlyAvg * 0.7) {
            suggestions.push({
              productId: product.id,
              productName: product.name,
              recommendation: "Sugerowana promocja -20%",
              reason: "Niższa sprzedaż w tym miesiącu względem średniej rocznej",
              priority: "medium",
            });
          }
        }

        // Rekomendacja z nadmiaru magazynowego wymaga REALNEGO stanu —
        // pomijamy, gdy stock jest nieznany (null), by nie zmyślać przesłanki.
        if (
          typeof product.stock === "number" &&
          typeof product.minStock === "number" &&
          product.stock > product.minStock * 3
        ) {
          suggestions.push({
            productId: product.id,
            productName: product.name,
            recommendation: "Sugerowana promocja -25%",
            reason: "Nadmierny stan magazynowy",
            priority: "medium",
          });
        }
      });
    }

    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    res.json(suggestions.slice(0, 5));
  })
);

export default router;
