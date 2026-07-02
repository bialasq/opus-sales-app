import express, { type Request, type Response } from "express";
import { validateBody } from "../middleware/validateRequest";
import { requireOrg } from "../middleware/session";
import { asyncHandler } from "../utils/asyncHandler";
import { readWorkbookFromUpload } from "../utils/uploadReader";
import {
  sendReminderBodySchema,
  paymentsOverdueBodySchema,
} from "../schemas/apiRequests";
import type { PaymentOverdueRecord, SendReminderResponse } from "../types/api";
import { excelService } from "../services/excelService";
import emailService from "../services/emailService";
import { PAYMENTS_UNAVAILABLE } from "../services/workbookSections";

const router = express.Router();

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
  asyncHandler(async (req: Request, res: Response) => {
    const { filename } = req.body as { filename?: string };
    const organizationId = req.auth!.organizationId;

    if (!filename?.trim()) {
      // Bez pliku nie ma z czego liczyć zaległości — zwracamy jawny brak danych,
      // zamiast podstawiać fikcyjne faktury.
      res.json({
        available: false,
        reason: "Wybierz plik z fakturami, aby zobaczyć zaległości płatnicze.",
      });
      return;
    }

    const result = await mapOverdueFromWorkbook(filename.trim(), organizationId);
    res.json(result);
  })
);

router.post(
  "/send-reminder",
  requireOrg,
  validateBody(sendReminderBodySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const smtpConfigured = Boolean(process.env.SMTP_HOST?.trim());
    if (!smtpConfigured) {
      // Nie udajemy wysyłki — brak integracji SMTP jest jawnie zgłaszany.
      res.status(501).json({
        success: false,
        error:
          "Wysyłka przypomnień nie jest skonfigurowana (brak SMTP_HOST). Skonfiguruj SMTP w backend/.env.",
      });
      return;
    }

    const { invoiceNumber, customerId, customerEmail, amount } = req.body as {
      invoiceNumber?: string;
      customerId?: string;
      customerEmail?: string;
      amount?: number;
    };
    const result = await emailService.sendPaymentReminder({
      customerEmail,
      invoiceNumber,
      amount,
    });
    const body: SendReminderResponse = {
      success: result.success,
      message: `${result.message} (faktura ${invoiceNumber ?? ""}, klient ${
        customerId ?? ""
      })`,
    };
    res.json(body);
  })
);

export default router;
