import express, { type Request, type Response } from "express";
import { validateBody } from "../middleware/validateRequest";
import { requireOrg } from "../middleware/session";
import { asyncHandler } from "../utils/asyncHandler";
import { readWorkbookFromUpload } from "../utils/uploadReader";
import { filenameBodySchema, visitPlanBodySchema } from "../schemas/apiRequests";
import type { VisitPlanResponse } from "../types/api";
import { excelService } from "../services/excelService";

const router = express.Router();

router.post(
  "/profile",
  requireOrg,
  validateBody(filenameBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { filename } = req.body as { filename: string };
    const organizationId = req.auth!.organizationId;
    const data = await readWorkbookFromUpload(filename, organizationId);
    const customerProfiles = excelService.analyzeCustomerData(data);
    res.json(customerProfiles);
  })
);

router.post(
  "/visit-plan",
  validateBody(visitPlanBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { profiles } = req.body as {
      profiles: Record<string, Record<string, unknown>>;
    };

    if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) {
      res
        .status(400)
        .json({ error: "Pole profiles musi być obiektem mapy klientów." });
      return;
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
  })
);

export default router;
