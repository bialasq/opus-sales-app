import express, { type Request, type Response } from "express";
import { getBudgetStatus } from "../utils/budgetManager";
import { getLlmConfigStatus } from "../services/llmInvoke";

const router = express.Router();

router.get("/budget", (_req: Request, res: Response) => {
  res.json(getBudgetStatus());
});

router.get("/llm-status", (_req: Request, res: Response) => {
  const status = getLlmConfigStatus();
  res.json({
    ...status,
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  });
});

export default router;
