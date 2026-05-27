/** Zwalidowany wiersz arkusza Sprzedaż. */
export interface SalesRow {
  productName: string;
  category: string;
  revenue: number;
  margin: number;
  quantity: number;
  customerNip: string | null;
  customerName: string;
  salesperson: string | null;
  saleDate: string;
}

/** Zwalidowany wiersz arkusza Wizyty. */
export interface VisitRow {
  isSalesVisit: string;
  region: string;
  salesperson: string;
  distanceKm: number;
  durationMinutes: number;
  description: string;
  clientNip: string | null;
  customerName: string;
  visitDate: string;
  city: string;
}

/** Zwalidowany wiersz arkusza Faktury. */
export interface PaymentRow {
  invoiceNumber: string;
  customerNip: string | null;
  customerName: string;
  amount: number;
  dueDate: string;
  status: string;
  email: string | null;
}

/** Workbook po walidacji — gotowy do analizy domenowej i LLM. */
export interface ValidatedExcelWorkbook {
  visits: VisitRow[];
  sales: SalesRow[];
  payments: PaymentRow[];
}
