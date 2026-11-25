import { useMemo, useState } from "react";
import { Activity, CircleDollarSign, Download, Printer, ShoppingBag, TrendingUp } from "lucide-react";
import { downloadCsv, money, n, rows, s } from "../../lib/format";
import type { Row, Snapshot } from "../../lib/types";
import { PageHeading, SalesTable, StatCard } from "../ui";

export function SalesPage({ snapshot, query, onReceipt }: { snapshot: Snapshot | null; query: string; onReceipt: (sale: Row) => void }) {
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PAID" | "CREDIT" | "CASH" | "MOMO">("ALL");
  const list = useMemo(() => (
    rows(snapshot?.sales)
      .sort((a, b) => n(b.saleDate) - n(a.saleDate))
      .filter((sale) => {
        const matchesQ = !query.trim() || [sale.receiptNumber, sale.customerName, sale.cashierName, sale.paymentMethod].some((v) => s(v).toLowerCase().includes(query.toLowerCase()));
        if (!matchesQ) return false;
        const status = s(sale.paymentStatus).toUpperCase();
        const method = s(sale.paymentMethod).toUpperCase();
        if (statusFilter === "PAID") return status === "PAID";
        if (statusFilter === "CREDIT") return status === "UNPAID" || status === "PARTIAL" || method.includes("CREDIT");
        if (statusFilter === "CASH") return method.includes("CASH");
        if (statusFilter === "MOMO") return method.includes("MOMO") || method.includes("AIRTEL") || method.includes("MOBILE");
        return true;
      })
  ), [snapshot?.sales, query, statusFilter]);
  const total = list.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const profit = list.reduce((sum, sale) => sum + n(sale.totalProfit), 0);
  const margin = total > 0 ? Math.round((profit / total) * 100) : 0;
  return <div className="page-stack"><PageHeading title="Sales ledger" description="A complete, searchable register of sales synchronized from all shop terminals." action={<div className="heading-actions"><button className="btn-outline" onClick={() => downloadCsv("beboss-sales-" + Date.now() + ".csv", ["receiptNumber", "saleDate", "customerName", "cashierName", "paymentMethod", "paymentStatus", "amountPaid", "totalAmount", "totalCost", "totalProfit", "discountAmount", "branchId"], list)}><Download size={15} /> Export CSV</button><button className="btn-outline" onClick={() => window.print()}><Printer size={16} /> Print ledger</button></div>} />
    <div className="stat-grid four">
      <StatCard label="Transactions" value={list.length.toLocaleString()} sub="Filtered register" icon={ShoppingBag} tone="blue" />
      <StatCard label="Gross sales" value={money(total)} sub="Total revenue" icon={CircleDollarSign} tone="green" />
      <StatCard label="Gross profit" value={money(profit)} sub={margin + "% average margin"} icon={TrendingUp} tone="orange" />
      <StatCard label="Average order" value={money(list.length ? total / list.length : 0)} sub="Per receipt" icon={Activity} tone="purple" />
    </div>
    <div className="toolbar">
      <div className="filter-tabs">
        {([["ALL", "All sales"], ["PAID", "Paid"], ["CREDIT", "Credit / Partial"], ["CASH", "Cash"], ["MOMO", "Mobile Money"]] as const).map(([key, label]) => (
          <button key={key} className={statusFilter === key ? "active" : ""} onClick={() => setStatusFilter(key)}>{label}</button>
        ))}
      </div>
      <span className="muted">{list.length} receipt{list.length === 1 ? "" : "s"}</span>
    </div>
    <div className="panel table-panel"><SalesTable sales={list} onReceipt={onReceipt} /></div>
  </div>;
}