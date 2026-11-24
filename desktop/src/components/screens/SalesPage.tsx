import { Activity, CircleDollarSign, Download, Printer, ShoppingBag } from "lucide-react";
import { downloadCsv, money, n, rows, s } from "../../lib/format";
import type { Row, Snapshot } from "../../lib/types";
import { PageHeading, SalesTable, StatCard } from "../ui";

export function SalesPage({ snapshot, query, onReceipt }: { snapshot: Snapshot | null; query: string; onReceipt: (sale: Row) => void }) {
  const list = rows(snapshot?.sales).sort((a, b) => n(b.saleDate) - n(a.saleDate)).filter((sale) => [sale.receiptNumber, sale.customerName, sale.cashierName, sale.paymentMethod].some((v) => s(v).toLowerCase().includes(query.toLowerCase())));
  const total = list.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  return <div className="page-stack"><PageHeading title="Sales ledger" description="A complete, searchable register of sales synchronized from all shop terminals." action={<div className="heading-actions"><button className="btn-outline" onClick={() => downloadCsv("beboss-sales-" + Date.now() + ".csv", ["receiptNumber", "saleDate", "customerName", "cashierName", "paymentMethod", "paymentStatus", "amountPaid", "totalAmount", "totalCost", "totalProfit", "discountAmount", "branchId"], list)}><Download size={15} /> Export CSV</button><button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> Print ledger</button></div>} />
    <div className="stat-grid three"><StatCard label="Transactions" value={list.length.toLocaleString()} icon={ShoppingBag} /><StatCard label="Gross sales" value={money(total)} icon={CircleDollarSign} tone="green" /><StatCard label="Average order" value={money(list.length ? total / list.length : 0)} icon={Activity} tone="purple" /></div>
    <div className="panel table-panel"><SalesTable sales={list} onReceipt={onReceipt} /></div>
  </div>;
}