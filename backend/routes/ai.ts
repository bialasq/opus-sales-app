import express, { type Request, type Response } from "express";

import { validateBody, validateParams, validateQuery } from "../middleware/validateRequest";

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



const log = createLogger("routes/ai");

const router = express.Router();



router.get(

  "/insights",

  validateQuery(aiInsightsQuerySchema),

  async (req: Request, res: Response) => {

    try {

      const { filename, userInstructions } = req.query as {

        filename: string;

        userInstructions?: string;

      };

      const result = await getAiInsightsForFile(filename.trim(), {

        userInstructions: userInstructions?.trim(),

      });

      res.json(result);

    } catch (error) {

      const message = error instanceof Error ? error.message : "Unknown error";

      log.error("GET /api/ai/insights", error);

      res.status(500).json({ error: message });

    }

  }

);



/** Asynchroniczny start — zwraca sessionId do pollingu */

router.post(

  "/insights/run",

  validateBody(aiInsightsRunBodySchema),

  async (req: Request, res: Response) => {

    try {

      const { filename, userInstructions } = req.body as {

        filename: string;

        userInstructions?: string;

      };

      const sessionId = startAiInsightsJob(

        filename.trim(),

        userInstructions?.trim()

      );

      res.status(202).json({ sessionId, status: "running", current_step: "Przygotowanie analizy…" });

    } catch (error) {

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

    const job = getAiInsightsJobStatus(sessionId);

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



router.get("/performance", (_req: Request, res: Response) => {

  try {

    res.json(getAiPerformanceStats());

  } catch (error) {

    const message = error instanceof Error ? error.message : "Unknown error";

    log.error("GET /api/ai/performance", error);

    res.status(500).json({ error: message });

  }

});



/** Sales Route Optimizer — plan 8h dnia z Olsztyna */
router.post(
  "/plan-route",
  validateBody(planRouteBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename, userInstructions } = req.body as {
        filename: string;
        userInstructions?: string;
      };
      const result = await planSalesRoute(
        filename.trim(),
        userInstructions?.trim()
      );
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      log.error("POST /api/ai/plan-route", error);
      res.status(500).json({ error: message });
    }
  }
);

router.post("/cache/clear", (_req: Request, res: Response) => {

  try {

    const result = clearAiCache();

    res.json({ ok: true, ...result });

  } catch (error) {

    const message = error instanceof Error ? error.message : "Unknown error";

    log.error("POST /api/ai/cache/clear", error);

    res.status(500).json({ error: message });

  }

});



module.exports = router;

