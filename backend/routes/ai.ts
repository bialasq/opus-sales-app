import express, { type Request, type Response } from "express";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validateRequest";
import { requireOrg, requireRole } from "../middleware/session";
import { assertFileOwnership } from "../services/fileOwnership";
import { asyncHandler } from "../utils/asyncHandler";
import {
  aiInsightsJobParamsSchema,
  aiInsightsQuerySchema,
  aiInsightsRunBodySchema,
  suggestionFeedbackBodySchema,
  planRouteBodySchema,
} from "../schemas/apiRequests";
import {
  clearAiCache,
  getAiPerformanceStats,
} from "../services/aiAnalyticsService";
import {
  getAiInsightsForFile,
  getAiInsightsJobStatus,
  recordSuggestionFeedback,
  startAiInsightsJob,
} from "../services/aiService";
import { planSalesRoute } from "../services/routePlannerService";
import { prisma } from "../services/prisma";
import { readWorkbookFromUpload } from "../utils/uploadReader";
import { VISITS_UNAVAILABLE } from "../services/workbookSections";

const router = express.Router();

router.get(
  "/insights",
  requireOrg,
  validateQuery(aiInsightsQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { filename, userInstructions } = req.query as {
      filename: string;
      userInstructions?: string;
    };
    const organizationId = req.auth!.organizationId;
    const result = await getAiInsightsForFile(filename.trim(), organizationId, {
      userInstructions: userInstructions?.trim(),
    });
    res.json(result);
  })
);

/** Asynchroniczny start — zwraca sessionId do pollingu */
router.post(
  "/insights/run",
  requireOrg,
  validateBody(aiInsightsRunBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { filename, userInstructions } = req.body as {
      filename: string;
      userInstructions?: string;
    };
    const organizationId = req.auth!.organizationId;
    const owned = await assertFileOwnership(req, filename.trim());

    const sessionId = startAiInsightsJob(
      filename.trim(),
      organizationId,
      req.auth!.userId,
      owned.id,
      userInstructions?.trim()
    );

    res.status(202).json({
      sessionId,
      status: "running",
      current_step: "Przygotowanie analizy…",
    });
  })
);

/** Historia jobów AI organizacji — zasila widok "Historia AI" w UI. */
router.get(
  "/insights/jobs",
  requireOrg,
  asyncHandler(async (req: Request, res: Response) => {
    const rows = await prisma.analysisJob.findMany({
      where: { organizationId: req.auth!.organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        sessionId: true,
        status: true,
        currentStep: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        file: { select: { originalName: true, storageKey: true } },
        createdBy: { select: { name: true, email: true } },
      },
    });
    res.json({
      jobs: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  })
);

router.get(
  "/insights/job/:sessionId",
  requireOrg,
  validateParams(aiInsightsJobParamsSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params as { sessionId: string };
    const job = await getAiInsightsJobStatus(sessionId);

    if (!job || job.organizationId !== req.auth!.organizationId) {
      res.status(404).json({
        error: "Nie znaleziono zadania agenta (wygasło lub błędny sessionId)",
      });
      return;
    }

    const { organizationId: _org, ...clientJob } = job;
    res.json(clientJob);
  })
);

/** RLHF — zatwierdzenie / odrzucenie sugestii */
router.post(
  "/insights/feedback",
  validateBody(suggestionFeedbackBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const loggedTo = recordSuggestionFeedback(req.body);
    res.json({ ok: true, loggedTo });
  })
);

router.get(
  "/performance",
  requireOrg,
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getAiPerformanceStats());
  })
);

/** Sales Route Optimizer — plan 8h dnia z Olsztyna */
router.post(
  "/plan-route",
  requireOrg,
  validateBody(planRouteBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { filename, userInstructions } = req.body as {
      filename: string;
      userInstructions?: string;
    };
    const organizationId = req.auth!.organizationId;
    const workbook = await readWorkbookFromUpload(filename.trim(), organizationId);
    if (!workbook.visits.length) {
      res.json(VISITS_UNAVAILABLE);
      return;
    }
    const result = await planSalesRoute(
      filename.trim(),
      organizationId,
      userInstructions?.trim()
    );
    res.json(result);
  })
);

router.post(
  "/cache/clear",
  requireOrg,
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await clearAiCache();
    res.json({ ok: true, ...result });
  })
);

export default router;
