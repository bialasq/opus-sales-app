import express, { type Request, type Response } from "express";
import { createLogger } from "../services/appLogger";

const log = createLogger("routes/customers");
import { validateBody } from "../middleware/validateRequest";
import {
  InvalidFilenameError,
  resolveUploadPath,
} from "../utils/filePathResolver";
import { filenameBodySchema, visitPlanBodySchema } from "../schemas/apiRequests";
import type { CustomerProfilesResponse, VisitPlanResponse } from "../types/api";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const excelService = require("../services/excelService") as {
  readFile: (p: string) => Record<string, Record<string, unknown>[]>;
  analyzeCustomerData: (
    data: Record<string, Record<string, unknown>[]>
  ) => CustomerProfilesResponse;
};

const router = express.Router();

router.post(
  "/profile",
  validateBody(filenameBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename } = req.body as { filename: string };
      const filePath = resolveUploadPath(filename);
      const data = excelService.readFile(filePath);
      const customerProfiles = excelService.analyzeCustomerData(data);
      res.json(customerProfiles);
    } catch (error) {
      if (error instanceof InvalidFilenameError) {
        log.warn("Invalid filename w /customers/profile", { detail: error.message });
        res.status(400).json({ error: "Invalid filename" });
        return;
      }
      log.error("Błąd profilowania klientów:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({ error: msg });
    }
  }
);

router.post(
  "/visit-plan",
  validateBody(visitPlanBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { profiles } = req.body as {
        profiles: Record<string, Record<string, unknown>>;
      };

      if (
        !profiles ||
        typeof profiles !== "object" ||
        Array.isArray(profiles)
      ) {
        return res.status(400).json({ error: "Pole profiles musi być obiektem mapy klientów." });
      }

      const visitPlan: VisitPlanResponse = [];
      const today = new Date();

      Object.entries(profiles).forEach(([customerId, profile]) => {
        let nextVisit: Date;
        const baseDate = new Date(today);
        const tier = String(profile.tier ?? "");

        switch (tier) {
          case "T1":
            baseDate.setDate(baseDate.getDate() + 14);
            nextVisit = baseDate;
            break;
          case "T2":
            baseDate.setMonth(baseDate.getMonth() + 1);
            nextVisit = baseDate;
            break;
          case "T3":
            baseDate.setMonth(baseDate.getMonth() + 2);
            nextVisit = baseDate;
            break;
          default:
            baseDate.setMonth(baseDate.getMonth() + 1);
            nextVisit = baseDate;
        }

        visitPlan.push({
          customerId,
          customerName: String(profile.name ?? ""),
          city: String(profile.city || "Nieznane"),
          tier,
          nextVisit: nextVisit.toISOString(),
          priority:
            tier === "T1" ? "Wysoki" : tier === "T2" ? "Średni" : "Niski",
          totalValue: Number(profile.totalValue ?? 0),
          totalOrders: Number(profile.totalOrders ?? 0),
        });
      });

      const priorityOrder: Record<string, number> = {
        Wysoki: 0,
        Średni: 1,
        Niski: 2,
      };

      visitPlan.sort((a, b) => {
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return new Date(a.nextVisit).getTime() - new Date(b.nextVisit).getTime();
      });

      res.json(visitPlan);
    } catch (error) {
      log.error("Błąd generowania planu wizyt:", error);
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({ error: msg });
    }
  }
);

module.exports = router;
