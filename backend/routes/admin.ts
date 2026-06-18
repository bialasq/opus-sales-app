import express, { type Request, type Response } from "express";
import { requireOrg, requireRole } from "../middleware/session";
import { getBudgetStatus } from "../utils/budgetManager";
import { getLlmConfigStatus } from "../services/llmInvoke";

const router = express.Router();

router.get(
  "/budget",
  requireOrg,
  requireRole("OWNER", "ADMIN"),
  (_req: Request, res: Response) => {
    res.json(getBudgetStatus());
  }
);

router.get(
  "/llm-status",
  requireOrg,
  requireRole("OWNER", "ADMIN"),
  (_req: Request, res: Response) => {
    const status = getLlmConfigStatus();
    res.json({
      ...status,
      hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
      hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    });
  }
);

export default router;
