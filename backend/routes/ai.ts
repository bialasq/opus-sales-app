import express, { type Request, type Response } from "express";
import { validateQuery } from "../middleware/validateRequest";
import { aiInsightsQuerySchema } from "../schemas/apiRequests";
import { getAiInsightsForFile } from "../services/aiService";

const router = express.Router();

router.get(
  "/insights",
  validateQuery(aiInsightsQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename } = req.query as { filename: string };
      const result = await getAiInsightsForFile(filename.trim());
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("[GET /api/ai/insights]", error);
      res.status(500).json({ error: message });
    }
  }
);

module.exports = router;
