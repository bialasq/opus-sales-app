import express, { type Request, type Response } from "express";
import { validateBody } from "../middleware/validateRequest";
import { requireOrg } from "../middleware/session";
import { FileNotOwnedError } from "../services/fileOwnership";
import { InvalidFilenameError } from "../utils/filePathResolver";
import { readWorkbookFromUpload } from "../utils/uploadReader";
import {
  sendReminderBodySchema,
  paymentsOverdueBodySchema,
} from "../schemas/apiRequests";
import type { PaymentOverdueRecord, SendReminderResponse } from "../types/api";
import { ValidationError } from "../errors";
import { excelService } from "../services/excelService";
import { PAYMENTS_UNAVAILABLE } from "../services/workbookSections";
import { createLogger } from "../services/appLogger";

const log = createLogger("routes/payments");

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

function mapOverdueFromWorkbook(
  filename: string,
  organizationId: string
): Promise<
  | typeof PAYMENTS_UNAVAILABLE
  | { available: true; data: PaymentOverdueRecord[] }
> {
  return readWorkbookFromUpload(filename, organizationId).then((workbook) => {
    if (!workbook.payments.length) {
      return PAYMENTS_UNAVAILABLE;
    }
    const analysis = excelService.analyzePayments(workbook.payments);
    const data: PaymentOverdueRecord[] = analysis.overduePayments.map((p) => ({
      invoiceNumber: String(p.invoiceNumber),
      customerId: String(p.customerNIP ?? ""),
      customerName: p.customerName,
      amount: p.amount,
      dueDate:
        p.dueDate instanceof Date
          ? p.dueDate.toISOString().slice(0, 10)
          : String(p.dueDate),
      status: "overdue",
      daysOverdue: p.daysOverdue,
    }));
    return { available: true, data };
  });
}

router.post(
  "/overdue",
  requireOrg,
  validateBody(paymentsOverdueBodySchema),
  async (req: Request, res: Response) => {
    try {
      const { filename } = req.body as { filename?: string };
      const organizationId = req.auth!.organizationId;

      if (filename?.trim()) {
        const result = await mapOverdueFromWorkbook(
          filename.trim(),
          organizationId
        );
        res.json(result);
        return;
      }

      const overduePayments = mockPayments.filter((p) => p.status === "overdue");
      res.json({ available: true, data: overduePayments });
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(error.statusCode).json({ error: error.publicMessage });
        return;
      }
      if (error instanceof InvalidFilenameError) {
        log.warn("Invalid filename w /payments/overdue", { detail: error.message });
        res.status(400).json({ error: "Invalid filename" });
        return;
      }
      if (error instanceof FileNotOwnedError) {
        res.status(404).json({ error: "Plik nie istnieje" });
        return;
      }
      const msg = error instanceof Error ? error.message : "Error";
      log.error("Błąd /payments/overdue:", error);
      res.status(500).json({ error: msg });
    }
  }
);

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

export default router;
