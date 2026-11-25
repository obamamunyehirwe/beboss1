import { describe, expect, it } from "vitest";
import { buildCustomerPaymentRecord, normalizeCustomerPhone, summarizeCustomerActivity } from "./customer-management";

describe("customer management domain rules", () => {
  it("normalizes Rwandan customer phone numbers for duplicate detection", () => {
    expect(normalizeCustomerPhone("+250 788-123-456")).toBe("788123456");
    expect(normalizeCustomerPhone("0788 123 456")).toBe("788123456");
    expect(normalizeCustomerPhone("788123456")).toBe("788123456");
  });

  it("summarizes lifetime spend, history, recent activity, and receivable aging from actual records", () => {
    const now = Date.UTC(2026, 10, 25);
    const oldDate = now - 45 * 86400000;
    const summary = summarizeCustomerActivity(
      { id: "c1", name: "Aline", debtBalance: 12000, creditLimit: 10000, updatedAt: oldDate },
      [
        { id: "s1", customerId: "c1", totalAmount: 20000, amountPaid: 8000, saleDate: oldDate },
        { id: "s2", customerId: "c1", totalAmount: 5000, amountPaid: 5000, saleDate: now - 2 * 86400000 },
        { id: "walk", customerId: "", totalAmount: 9000, amountPaid: 9000, saleDate: now }
      ],
      [{ id: "p1", customerId: "c1", amount: 8000, paymentDate: now - 10 * 86400000 }],
      now
    );
    expect(summary.totalSpend).toBe(25000);
    expect(summary.customerSales).toHaveLength(2);
    expect(summary.customerPayments).toHaveLength(1);
    expect(summary.averageOrder).toBe(12500);
    expect(summary.lastActivityAt).toBe(now - 2 * 86400000);
    expect(summary.overLimit).toBe(true);
    expect(summary.overdue).toBe(true);
  });

  it("builds a payment receipt and remaining balance without mutating the original customer", () => {
    const customer = { id: "c2", name: "Eric", debtBalance: 50000, creditLimit: 80000 };
    const result = buildCustomerPaymentRecord({
      customer, amount: 15000, method: "MTN MoMo", notes: "TXN-123",
      paymentId: "pay-1", receiptNumber: "PAY-00001",
      recordedBy: "Owner", branchId: "main_branch", branchName: "Main Store",
      now: 1795600000000
    });
    expect(result.payment).toMatchObject({
      customerId: "c2", amount: 15000, previousDebt: 50000,
      remainingDebt: 35000, paymentMethod: "MTN MoMo",
      notes: "TXN-123", receiptNumber: "PAY-00001"
    });
    expect(result.customer.debtBalance).toBe(35000);
    expect(customer.debtBalance).toBe(50000);
  });

  it("rejects a collection larger than the current balance", () => {
    expect(() => buildCustomerPaymentRecord({
      customer: { id: "c3", name: "Mina", debtBalance: 1000 },
      amount: 1000.02, method: "Cash", paymentId: "pay-2",
      receiptNumber: "PAY-00002", recordedBy: "Owner",
      branchId: "main_branch", branchName: "Main Store", now: 1
    })).toThrow(/larger than the current outstanding balance/i);
  });
});
