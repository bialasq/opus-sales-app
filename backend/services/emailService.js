// backend/services/emailService.js
const nodemailer = require("nodemailer");

class EmailService {
  constructor() {
    // Konfiguracja będzie używana z .env
    this.transporter = null;
  }

  async initialize() {
    this.transporter = null;
  }

  async sendPaymentReminder(invoice) {
    // W prawdziwej implementacji tutaj byłoby wysyłanie maila
    return {
      success: true,
      message: "Email wysłany (tryb testowy)",
    };
  }
}

module.exports = new EmailService();
