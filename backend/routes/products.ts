import express, { type Request, type Response } from "express";
import path from "path";
import { validateBody } from "../middleware/validateRequest";
import { filenameBodySchema, promotionsBodySchema } from "../schemas/apiRequests";
import type { Product, ProductAnalysisResponse } from "../types/api";
import { analyzeProductRotationFromWorkbook } from "../services/productRotationFromSales";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const excelService = require("../services/excelService") as {
  readFile: (p: string) => Record<string, Record<string, unknown>[]>;
};

const router = express.Router();

router.post(
  "/analysis",
  validateBody(filenameBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename } = req.body as { filename: string };
      const filePath = path.join(__dirname, "..", "uploads", filename);
      const data = excelService.readFile(filePath);

      const productAnalysis = analyzeProductRotationFromWorkbook(data);

      const products: Product[] = Object.entries(productAnalysis).map(
        ([id, product]) => ({
          id,
          name: product.name,
          category: product.category || "Inne",
          stock: Math.floor(Math.random() * 100) + 10,
          minStock: 20,
          rotationRate: product.rotationRate || 0,
          sales: product.sales,
          totalQuantity: product.sales.reduce((sum, sale) => sum + sale.quantity, 0),
          totalValue: product.sales.reduce((sum, sale) => sum + sale.value, 0),
        })
      );

      const seasonalTrends: ProductAnalysisResponse["seasonalTrends"] = {};
      Object.entries(productAnalysis).forEach(([, product]) => {
        if (product.seasonalTrends) {
          seasonalTrends[product.name] = product.seasonalTrends;
        }
      });

      const out: ProductAnalysisResponse = {
        products: products.slice(0, 10),
        seasonalTrends,
        totalProducts: Object.keys(productAnalysis).length,
        categories: [...new Set(products.map((p) => p.category))],
      };

      res.json(out);
    } catch (error) {
      console.error("Błąd analizy produktów:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({ error: msg });
    }
  }
);

router.post(
  "/promotions",
  validateBody(promotionsBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { products, seasonalData } = req.body as {
        products?: Array<{
          id?: string;
          name: string;
          rotationRate: number;
          stock?: number;
          minStock?: number;
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

          const stock = product.stock ?? 0;
          const minStock = product.minStock ?? 20;
          if (stock > minStock * 3) {
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
      suggestions.sort(
        (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
      );

      res.json(suggestions.slice(0, 5));
    } catch (error) {
      console.error("Błąd generowania promocji:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({ error: msg });
    }
  }
);

module.exports = router;
