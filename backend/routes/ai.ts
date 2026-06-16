import express, { type Request, type Response } from "express";

import { validateBody, validateParams, validateQuery } from "../middleware/validateRequest";
import { requireOrg } from "../middleware/session";
import { FileNotOwnedError, assertFileOwnership } from "../services/fileOwnership";

import {

  aiInsightsJobParamsSchema,

  aiInsightsQuerySchema,

  aiInsightsRunBodySchema,

  suggestionFeedbackBodySchema,
  planRouteBodySchema,

} from "../schemas/apiRequests";

import { createLogger } from "../services/appLogger";

import { clearAiCache, getAiPerformanceStats } from "../services/aiAnalyticsService";

import {

  getAiInsightsForFile,

  getAiInsightsJobStatus,

  recordSuggestionFeedback,

  startAiInsightsJob,

} from "../services/aiService";
import { planSalesRoute } from "../services/routePlannerService";
import { InvalidFilenameError } from "../utils/filePathResolver";
import { readWorkbookFromUpload } from "../utils/uploadReader";
import { VISITS_UNAVAILABLE } from "../services/workbookSections";

const log = createLogger("routes/ai");

const router = express.Router();



router.get(

  "/insights",

  requireOrg,

  validateQuery(aiInsightsQuerySchema),

  async (req: Request, res: Response) => {

    try {

      const { filename, userInstructions } = req.query as {

        filename: string;

        userInstructions?: string;

      };

      const organizationId = req.auth!.organizationId;

      const result = await getAiInsightsForFile(filename.trim(), organizationId, {

        userInstructions: userInstructions?.trim(),

      });

      res.json(result);

    } catch (error) {
      if (error instanceof InvalidFilenameError) {
        log.warn("Invalid filename w GET /api/ai/insights", { detail: error.message });
        res.status(400).json({ error: "Invalid filename" });
        return;
      }
      if (error instanceof FileNotOwnedError) {
        res.status(404).json({ error: "Plik nie istnieje" });
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error("GET /api/ai/insights", error);
      res.status(500).json({ error: message });
    }
  }
);

/** Asynchroniczny start — zwraca sessionId do pollingu */

router.post(

  "/insights/run",

  requireOrg,

  validateBody(aiInsightsRunBodySchema),

  async (req: Request, res: Response) => {

    try {

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

      res.status(202).json({ sessionId, status: "running", current_step: "Przygotowanie analizy…" });

    } catch (error) {
      if (error instanceof InvalidFilenameError) {
        log.warn("Invalid filename w POST /api/ai/insights/run", { detail: error.message });
        res.status(400).json({ error: "Invalid filename" });
        return;
      }
      if (error instanceof FileNotOwnedError) {
        res.status(404).json({ error: "Plik nie istnieje" });
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error("POST /api/ai/insights/run", error);
      res.status(500).json({ error: message });
    }
  }
);

router.get(
  "/insights/job/:sessionId",

  validateParams(aiInsightsJobParamsSchema),

  async (req: Request, res: Response) => {

    const { sessionId } = req.params as { sessionId: string };

    const job = await getAiInsightsJobStatus(sessionId);

    if (!job) {

      res.status(404).json({ error: "Nie znaleziono zadania agenta (wygasło lub błędny sessionId)" });

      return;

    }

    res.json(job);

  }

);



/** RLHF — zatwierdzenie / odrzucenie sugestii */

router.post(

  "/insights/feedback",

  validateBody(suggestionFeedbackBodySchema),

  async (req: Request, res: Response) => {

    try {

      const path = recordSuggestionFeedback(req.body);

      res.json({ ok: true, loggedTo: path });

    } catch (error) {

      const message = error instanceof Error ? error.message : "Unknown error";

      log.error("POST /api/ai/insights/feedback", error);

      res.status(500).json({ error: message });

    }

  }

);



router.get("/performance", async (_req: Request, res: Response) => {

  try {

    res.json(await getAiPerformanceStats());

  } catch (error) {

    const message = error instanceof Error ? error.message : "Unknown error";

    log.error("GET /api/ai/performance", error);

    res.status(500).json({ error: message });

  }

});



/** Sales Route Optimizer — plan 8h dnia z Olsztyna */
router.post(
  "/plan-route",
  requireOrg,
  validateBody(planRouteBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename, userInstructions } = req.body as {
        filename: string;
        userInstructions?: string;
      };
      const organizationId = req.auth!.organizationId;
      const workbook = await readWorkbookFromUpload(
        filename.trim(),
        organizationId
      );
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
    } catch (error) {
      if (error instanceof InvalidFilenameError) {
        log.warn("Invalid filename w POST /api/ai/plan-route", { detail: error.message });
        res.status(400).json({ error: "Invalid filename" });
        return;
      }
      if (error instanceof FileNotOwnedError) {
        res.status(404).json({ error: "Plik nie istnieje" });
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error("POST /api/ai/plan-route", error);
      res.status(500).json({ error: message });
    }
  }
);

router.post("/cache/clear", async (_req: Request, res: Response) => {

  try {

    const result = await clearAiCache();

    res.json({ ok: true, ...result });

  } catch (error) {

    const message = error instanceof Error ? error.message : "Unknown error";

    log.error("POST /api/ai/cache/clear", error);

    res.status(500).json({ error: message });

  }

});



export default router;

