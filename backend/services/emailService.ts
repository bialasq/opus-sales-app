export type PaymentReminderInvoice = {
  customerEmail?: string;
  invoiceNumber?: string;
  amount?: number;
};

class EmailService {
  async initialize(): Promise<void> {
    /* SMTP configured via env when implemented */
  }

  async sendPaymentReminder(
    invoice: PaymentReminderInvoice
  ): Promise<{ success: boolean; message: string }> {
    void invoice;
    return {
      success: true,
      message: "Email wysłany (tryb testowy)",
    };
  }
}

export default new EmailService();
