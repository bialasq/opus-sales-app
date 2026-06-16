export type {
  PaymentRow,
  SalesRow,
  ValidatedExcelWorkbook,
  VisitRow,
} from "../types/excelTypes";
export interface VisitRegionStats {
  total: number;
  sales: number;
  nonSales: number;
}

export interface VisitSalespersonStats {
  visits: number;
  salesVisits: number;
  distance: number;
  time: number;
}

export interface VisitAnalysis {
  totalVisits: number;
  salesVisits: number;
  nonSalesVisits: number;
  visitsByRegion: Record<string, VisitRegionStats>;
  visitsBySalesperson: Record<string, VisitSalespersonStats>;
  totalDistance: number;
  totalTime: number;
  conversionRate: number | string;
  customerPriorities: Record<string, string>;
}

export interface SalesCategoryStats {
  revenue: number;
  margin: number;
  quantity: number;
}

export interface SalesProductStats {
  revenue: number;
  quantity: number;
  lastSaleDate: Date;
  category: string;
}

export interface SalesCustomerStats {
  name: string;
  revenue: number;
  orders: number;
  lastOrderDate: Date;
  products: Set<string>;
}

export interface SalesSalespersonStats {
  revenue: number;
  margin: number;
  customers: Set<string>;
}

export interface SalesMonthlyTrend {
  revenue: number;
  orders: number;
}

export interface InactiveProduct {
  product: string;
  category: string;
  lastSale: Date;
  daysSinceLastSale: number;
}

export interface CustomerTierEntry {
  tier: string;
  label: string;
  data: SalesCustomerStats;
}

export interface SalesAnalysis {
  totalRevenue: number;
  totalMargin: number;
  salesByCategory: Record<string, SalesCategoryStats>;
  salesByProduct: Record<string, SalesProductStats>;
  salesByCustomer: Record<string, SalesCustomerStats>;
  salesBySalesperson: Record<string, SalesSalespersonStats>;
  productRotation: Record<string, unknown>;
  customerTiers: Record<string, CustomerTierEntry>;
  monthlyTrends: Record<string, SalesMonthlyTrend>;
  inactiveProducts: InactiveProduct[];
}

export interface OverduePayment {
  invoiceNumber: unknown;
  customerNIP: unknown;
  customerName: string;
  amount: number;
  dueDate: Date;
  daysOverdue: number;
  email: unknown;
}

export interface PaymentCustomerStats {
  name: string;
  total: number;
  overdue: number;
  overdueCount: number;
}

export interface PaymentAnalysis {
  totalOutstanding: number;
  overduePayments: OverduePayment[];
  paymentsByCustomer: Record<string, PaymentCustomerStats>;
  averagePaymentDelay: number | string;
}

export interface SalespersonEfficiencyMetrics {
  visitsCount: number;
  salesVisitsCount: number;
  conversionRate: number | string;
  revenue: number;
  revenuePerVisit: number | string;
  revenuePerKm: number | string;
  averageVisitTime: number | string;
  customersCount: number;
}

export interface CombinedMetrics {
  revenuePerKilometer: number | string;
  averageVisitDuration: number | string;
  conversionMetrics: Record<string, unknown>;
  salespersonEfficiency: Record<string, SalespersonEfficiencyMetrics>;
}

export interface CustomerProfile {
  name: string;
  city: string;
  tier: string;
  totalOrders: number;
  totalValue: number;
  visitFrequency: string;
}

export type CustomerProfilesMap = Record<string, CustomerProfile>;

export interface DataStructureInfo {
  columns: string[];
  sampleData: import("../types/excelTypes").SalesRow[];
}
