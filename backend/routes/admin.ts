import express, { type Request, type Response } from "express";
import { getBudgetStatus } from "../utils/budgetManager";

const router = express.Router();

router.get("/budget", (_req: Request, res: Response) => {
  res.json(getBudgetStatus());
});

module.exports = router;
