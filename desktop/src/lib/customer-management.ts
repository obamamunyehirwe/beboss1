import type { Row } from "./types";
import { n, s } from "./format";

export type CustomerSummary = {
  customer: Row;
  customerSales: Row[];
  customerPayments: Row[];
  totalSpend: number;
  unpaidSales: Row[];
  lastActivityAt: number;
  averageOrder: number;
  oldestUnpaidAt: number;
  overLimit: boolean;
  overdue: boolean;
};

export function normalizeCustomerPhone(value: unknown): string {
  const digits = s(value).replace(/\D/g, "");
  // Match Rwanda's common 0-prefixed national format with its +250 E.164 form.
  if (digits.startsWith("250") && digits.length === 12) return digits.slice(3);
  if (digits.startsWith("0") && digits.length === 10) return digits.slice(1);
  return digits;
}

export function summarizeCustomerActivity(
  customer: Row,
  sales: Row[],
  payments: Row[],
  now = Date.now()
): CustomerSummary {
  const customerId = s(customer.id);
  const customerSales = sales.filter((sale) => s(sale.customerId) === customerId);
  const customerPayments = payments.filter((payment) => s(payment.customerId) === customerId);
  const totalSpend = customerSales.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const unpaidSales = customerSales.filter((sale) => n(sale.totalAmount) > n(sale.amountPaid) + 0.01);
  const lastSaleAt = customerSales.reduce((latest, sale) => Math.max(latest, n(sale.saleDate)), 0);
  const lastPaymentAt = customerPayments.reduce((latest, payment) => Math.max(latest, n(payment.paymentDate)), 0);
  const lastActivityAt = Math.max(lastSaleAt, lastPaymentAt, n(customer.updatedAt));
  const oldestUnpaidAt = unpaidSales.reduce((oldest, sale) => {
    const saleDate = n(sale.saleDate);
    return saleDate > 0 ? Math.min(oldest || Number.POSITIVE_INFINITY, saleDate) : oldest;
  }, 0);
  const creditLimit = n(customer.creditLimit);
  const debtBalance = n(customer.debtBalance);
  return {
    customer,
    customerSales,
    customerPayments,
    totalSpend,
    unpaidSales,
    lastActivityAt,
    averageOrder: customerSales.length ? totalSpend / customerSales.length : 0,
    oldestUnpaidAt: Number.isFinite(oldestUnpaidAt) ? oldestUnpaidAt : 0,
    overLimit: creditLimit > 0 && debtBalance > creditLimit,
    overdue: debtBalance > 0 && oldestUnpaidAt > 0 && now - oldestUnpaidAt >= 30 * 86400000
  };
}

export function buildCustomerPaymentRecord(input: {
  customer: Row;
  amount: number;
  method: string;
  notes?: string;
  paymentId: string;
  receiptNumber: string;
  recordedBy: string;
  branchId: string;
  branchName: string;
  now: number;
}): { payment: Row; customer: Row } {
  const amount = n(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a payment greater than zero.");
  }
  const previousDebt = n(input.customer.debtBalance);
  if (amount > previousDebt + 0.01) {
    throw new Error("The payment is larger than the current outstanding balance.");
  }
  const remainingDebt = Math.max(0, previousDebt - amount);
  return {
    customer: { ...input.customer, debtBalance: remainingDebt, updatedAt: input.now },
    payment: {
      id: input.paymentId,
      customerId: s(input.customer.id),
      customerName: s(input.customer.name),
      amount,
      previousDebt,
      remainingDebt,
      paymentMethod: input.method,
      notes: s(input.notes).trim(),
      receiptNumber: input.receiptNumber,
      paymentDate: input.now,
      recordedBy: input.recordedBy,
      branchId: input.branchId,
      branchName: input.branchName
    }
  };
}
