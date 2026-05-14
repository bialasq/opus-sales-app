import express, { type Request, type Response } from "express";
import { validateBody } from "../middleware/validateRequest";
import { sendReminderBodySchema } from "../schemas/apiRequests";
import type { PaymentOverdueRecord, SendReminderResponse } from "../types/api";

const router = express.Router();

const mockPayments: PaymentOverdueRecord[] = [
  {
    invoiceNumber: "FV/2024/001",
    customerId: "001",
    customerName: "Firma ABC Sp. z o.o.",
    amount: 15000,
    dueDate: "2024-02-15",
    status: "overdue",
    daysOverdue: 25,
  },
  {
    invoiceNumber: "FV/2024/002",
    customerId: "002",
    customerName: "Sklep XYZ",
    amount: 8500,
    dueDate: "2024-03-20",
    status: "pending",
    daysOverdue: 0,
  },
];

router.post("/overdue", async (_req: Request, res: Response) => {
  try {
    const overduePayments = mockPayments.filter((p) => p.status === "overdue");
    res.json(overduePayments);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error";
    res.status(500).json({ error: msg });
  }
});

router.post(
  "/send-reminder",
  validateBody(sendReminderBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { invoiceNumber, customerId } = req.body as {
        invoiceNumber?: string;
        customerId?: string;
      };
      const body: SendReminderResponse = {
        success: true,
        message: `Przypomnienie wysłane dla faktury ${invoiceNumber ?? ""} (klient: ${
          customerId ?? ""
        })`,
      };
      res.json(body);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error";
      res.status(500).json({ error: msg });
    }
  }
);

module.exports = router;
