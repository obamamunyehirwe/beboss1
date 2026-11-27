import { Activity, ArrowDownRight, ArrowUpRight, Banknote, Download, Filter, ShieldCheck, Store, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadCsv, money, n, rows, s } from "../../lib/format";
import type { CloudState, Row, Snapshot } from "../../lib/types";
import { Empty, PageHeading, StatCard, StatusPill } from "../ui";

const DAY = 86400000;
type FinancePeriod = "TODAY" | "7D" | "30D" | "90D" | "ALL";

function timestampOf(row: Row, ...keys: string[]) {
  for (const key of keys) {
    const raw = row[key];
    const parsed = typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(raw) ? Date.parse(raw) : n(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}
function branchOf(row: Row, mainBranchId = "main_branch") {
  return s(row.branchId ?? row.branch_id) || mainBranchId;
}
function tenderOf(row: Row) {
  return s(row.paymentMethod ?? row.payment_method).trim().toUpperCase();
}
function amountCollected(row: Row) {
  const paid = Math.max(0, n(row.amountPaid ?? row.amount_paid));
  if (paid > 0) return paid;
  const status = s(row.paymentStatus ?? row.payment_status).toUpperCase();
  return status === "PAID" ? Math.max(0, n(row.totalAmount ?? row.total_amount)) : 0;
}
function cashTender(method: string) {
  return method === "CASH" || method === "CASH PAYMENT";
}
function parseReconciliation(event: Row): Row | null {
  try {
    const detail = JSON.parse(s(event.detail));
    return detail && typeof detail === "object" && detail.version === 1 ? detail as Row : null;
  } catch {
    return null;
  }
}

export function FinanceControlPage({ cloud, snapshot }: { cloud: CloudState; snapshot: Snapshot | null }) {
  const [period, setPeriod] = useState<FinancePeriod>("30D");
  const [branchFilter, setBranchFilter] = useState("ALL");
  

  const branches = rows(cloud.branches).filter((branch) => branch.is_active !== false);
  const mainBranchId = s(branches.find((branch) => branch.is_main_branch === true)?.id) || "main_branch";
  const branchNames = new Map<string, string>(branches.map((branch) => [s(branch.id), s(branch.name)]));
  const startAt = useMemo(() => {
    const now = new Date();
    if (period === "TODAY") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const days = period === "7D" ? 7 : period === "30D" ? 30 : period === "90D" ? 90 : 0;
    return days ? Date.now() - days * DAY : 0;
  }, [period]);
  const branchMatches = (record: Row) => branchFilter === "ALL" || branchOf(record, mainBranchId) === branchFilter;
  const sales = rows(snapshot?.sales).filter((sale) => {
    const time = timestampOf(sale, "saleDate", "sale_date");
    return (!startAt || time >= startAt) && branchMatches(sale);
  }).sort((a, b) => timestampOf(b, "saleDate", "sale_date") - timestampOf(a, "saleDate", "sale_date"));
  const payments = rows(snapshot?.customerPayments).filter((payment) => {
    const time = timestampOf(payment, "paymentDate", "payment_date");
    return (!startAt || time >= startAt) && branchMatches(payment);
  });
  const customers = rows(snapshot?.customers).filter((customer) => customer.isDeleted !== true);
  const receivables = customers.reduce((sum, customer) => sum + Math.max(0, n(customer.debtBalance)), 0);
  const revenue = sales.reduce((sum, sale) => sum + Math.max(0, n(sale.totalAmount ?? sale.total_amount)), 0);
  const cost = sales.reduce((sum, sale) => sum + Math.max(0, n(sale.totalCost ?? sale.total_cost)), 0);
  const grossProfit = sales.reduce((sum, sale) => sum + n(sale.totalProfit ?? sale.total_profit), 0);
  const discounts = sales.reduce((sum, sale) => sum + Math.max(0, n(sale.discountAmount ?? sale.discount_amount)), 0);
  const cashSales = sales.reduce((sum, sale) => cashTender(tenderOf(sale)) ? sum + amountCollected(sale) : sum, 0);
  const nonCashSales = sales.reduce((sum, sale) => !cashTender(tenderOf(sale)) ? sum + amountCollected(sale) : sum, 0);
  const cashRepayments = payments.reduce((sum, payment) => cashTender(tenderOf(payment)) ? sum + Math.max(0, n(payment.amount)) : sum, 0);
  const nonCashRepayments = payments.reduce((sum, payment) => !cashTender(tenderOf(payment)) ? sum + Math.max(0, n(payment.amount)) : sum, 0);
  const collected = cashSales + nonCashSales + cashRepayments + nonCashRepayments;
  const outstandingSales = sales.reduce((sum, sale) =>
    sum + Math.max(0, n(sale.totalAmount ?? sale.total_amount) - amountCollected(sale)), 0);
  const averageOrder = sales.length ? revenue / sales.length : 0;
  const margin = revenue > 0 ? grossProfit / revenue * 100 : 0;
  const transferExposure = rows(cloud.transfers).filter((transfer) =>
    ["REQUESTED", "IN_TRANSIT", "RECEIPT_REQUESTED", "CANCEL_REQUESTED"].includes(s(transfer.status).toUpperCase()) &&
    (branchFilter === "ALL" || s(transfer.from_branch_id) === branchFilter || s(transfer.to_branch_id) === branchFilter)
  ).reduce((sum, transfer) => sum + Math.max(0, n(transfer.cost_value_rwf)), 0);

  const branchSummary = useMemo(() => branches.map((branch) => {
    const id = s(branch.id);
    const localSales = sales.filter((sale) => branchOf(sale, mainBranchId) === (id || mainBranchId));
    const localPayments = payments.filter((payment) => branchOf(payment, mainBranchId) === (id || mainBranchId));
    const salesTotal = localSales.reduce((sum, sale) => sum + Math.max(0, n(sale.totalAmount ?? sale.total_amount)), 0);
    const collectedTotal = localSales.reduce((sum, sale) => sum + amountCollected(sale), 0) +
      localPayments.reduce((sum, payment) => sum + Math.max(0, n(payment.amount)), 0);
    return {
      id, name: s(branch.name), sales: salesTotal,
      cost: localSales.reduce((sum, sale) => sum + Math.max(0, n(sale.totalCost ?? sale.total_cost)), 0),
      profit: localSales.reduce((sum, sale) => sum + n(sale.totalProfit ?? sale.total_profit), 0),
      collected: collectedTotal, count: localSales.length,
      target: n(branch.monthly_target_rwf), status: s(branch.operational_status) || "OPEN"
    };
  }).filter((branch) => branchFilter === "ALL" || branch.id === branchFilter)
    .sort((a, b) => b.sales - a.sales), [branches, sales, payments, branchFilter]);

  const reconciliations = useMemo(() => rows(cloud.activity)
    .filter((event) => s(event.entity).toUpperCase() === "BRANCH_RECONCILIATION")
    .map((event) => ({ event, record: parseReconciliation(event) }))
    .filter((entry) => entry.record && (branchFilter === "ALL" || s(entry.record.branchId) === branchFilter))
    .sort((a, b) => timestampOf(b.event, "created_at") - timestampOf(a.event, "created_at"))
    .slice(0, 50), [cloud.activity, branchFilter]);

  function exportFinance() {
    const rowsForExport = [
      ...sales.map((sale) => ({
        record_type: "SALE", timestamp: new Date(timestampOf(sale, "saleDate", "sale_date")).toISOString(),
        branch: branchNames.get(branchOf(sale, mainBranchId)) || branchOf(sale, mainBranchId),
        reference: s(sale.receiptNumber ?? sale.receipt_number ?? sale.id),
        counterparty: s(sale.customerName ?? sale.customer_name) || "Walk-in Customer",
        method: tenderOf(sale), gross_amount_rwf: n(sale.totalAmount ?? sale.total_amount),
        collected_amount_rwf: amountCollected(sale), cost_rwf: n(sale.totalCost ?? sale.total_cost),
        gross_profit_rwf: n(sale.totalProfit ?? sale.total_profit),
        status: s(sale.paymentStatus ?? sale.payment_status)
      })),
      ...payments.map((payment) => ({
        record_type: "CUSTOMER_REPAYMENT", timestamp: new Date(timestampOf(payment, "paymentDate", "payment_date")).toISOString(),
        branch: branchNames.get(branchOf(payment, mainBranchId)) || branchOf(payment, mainBranchId),
        reference: s(payment.receiptNumber ?? payment.receipt_number ?? payment.id),
        counterparty: s(payment.customerName ?? payment.customer_name),
        method: tenderOf(payment), gross_amount_rwf: n(payment.amount), collected_amount_rwf: n(payment.amount),
        cost_rwf: 0, gross_profit_rwf: 0, status: "COLLECTED"
      }))
    ];
    downloadCsv("BeBoss-Consolidated-Finance-" + new Date().toISOString().slice(0, 10) + ".csv",
      ["record_type","timestamp","branch","reference","counterparty","method","gross_amount_rwf","collected_amount_rwf","cost_rwf","gross_profit_rwf","status"],
      rowsForExport);
  }
  function exportBranches() {
    downloadCsv("BeBoss-Branch-Finance-" + new Date().toISOString().slice(0, 10) + ".csv",
      ["branch_id","branch_name","transactions","revenue_rwf","cost_of_goods_rwf","gross_profit_rwf","collections_rwf","monthly_target_rwf"],
      branchSummary.map((branch) => ({
        branch_id: branch.id, branch_name: branch.name, transactions: branch.count,
        revenue_rwf: Math.round(branch.sales), cost_of_goods_rwf: Math.round(branch.cost),
        gross_profit_rwf: Math.round(branch.profit), collections_rwf: Math.round(branch.collected),
        monthly_target_rwf: branch.target
      })));
  }

  return <div className="page-stack finance-control-page">
    <PageHeading eyebrow="FINANCE · CONSOLIDATION · CONTROL" title="Financial control"
      description="Consolidated sales, collections, cost of goods, branch comparisons and recorded cash close-outs from the latest signed shop snapshot."
      action={<div className="enterprise-page-actions">
        <button className="btn-outline" onClick={exportBranches}><Download size={15} /> Export branch totals</button>
        <button className="btn-primary" onClick={exportFinance}><Download size={15} /> Export finance ledger</button>
      </div>} />
    <section className="panel enterprise-transfer-toolbar">
      <div className="enterprise-toolbar-controls">
        <label className="enterprise-search"><Filter size={15} /><select aria-label="Financial period" value={period} onChange={(event) => setPeriod(event.target.value as FinancePeriod)}>
          <option value="TODAY">Today</option><option value="7D">Last 7 days</option>
          <option value="30D">Last 30 days</option><option value="90D">Last 90 days</option><option value="ALL">All history</option>
        </select></label>
        <select aria-label="Financial branch filter" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
          <option value="ALL">All branches</option>
          {branches.map((branch) => <option key={s(branch.id)} value={s(branch.id)}>{s(branch.name)}</option>)}
        </select>
      </div>
      <div className="enterprise-toolbar-foot"><span>{sales.length.toLocaleString()} sales · {payments.length.toLocaleString()} customer repayments</span><span>Totals exclude operating expenses, supplier payables and bank deposits not present in this data model</span></div>
    </section>
    <div className="stat-grid four">
      <StatCard label="Gross sales" value={money(revenue)} sub={sales.length.toLocaleString() + " transactions · average " + money(averageOrder)} icon={Store} />
      <StatCard label="Cost of goods" value={money(cost)} sub="Recorded cost value at sale time" icon={ArrowDownRight} tone="blue" />
      <StatCard label="Gross profit" value={money(grossProfit)} sub={margin.toFixed(1) + "% gross margin · " + money(discounts) + " discounts"} icon={ArrowUpRight} tone={grossProfit >= 0 ? "green" : "orange"} />
      <StatCard label="Shop-wide receivables" value={money(receivables)} sub={money(outstandingSales) + " unpaid value in selected sales"} icon={Wallet} tone="orange" />
    </div>
    <div className="stat-grid four">
      <StatCard label="Cash collections" value={money(cashSales + cashRepayments)} sub={money(cashSales) + " sales · " + money(cashRepayments) + " repayments"} icon={Banknote} />
      <StatCard label="Non-cash collections" value={money(nonCashSales + nonCashRepayments)} sub={money(nonCashSales) + " sales · " + money(nonCashRepayments) + " repayments"} icon={Activity} tone="blue" />
      <StatCard label="Total recorded collections" value={money(collected)} sub="Sales paid amounts plus customer repayments" icon={ShieldCheck} tone="green" />
      <StatCard label="Open transfer value" value={money(transferExposure)} sub="Requested and unresolved stock movements" icon={Store} tone="purple" />
    </div>
    <div className="dashboard-grid">
      <section className="panel span-2">
        <div className="panel-heading"><div><span className="eyebrow muted">CONSOLIDATED BRANCH PERFORMANCE</span><h3>Branch finance comparison</h3></div><Store size={18} className="muted-icon" /></div>
        {branchSummary.length ? <div className="table-wrap"><table><thead><tr><th>Branch</th><th>State</th><th>Transactions</th><th>Gross sales</th><th>Cost of goods</th><th>Gross profit</th><th>Collections</th><th>Target</th></tr></thead>
          <tbody>{branchSummary.map((branch) => <tr key={branch.id}>
            <td><strong>{branch.name}</strong><small className="cell-sub mono">{branch.id}</small></td><td><StatusPill value={branch.status} /></td>
            <td>{branch.count}</td><td>{money(branch.sales)}</td><td>{money(branch.cost)}</td>
            <td className="strong">{money(branch.profit)}</td><td>{money(branch.collected)}</td>
            <td>{branch.target > 0 ? (branch.sales / branch.target * 100).toFixed(1) + "%" : "Not set"}</td>
          </tr>)}</tbody></table></div> : <Empty title="No branch records" description="Branch comparison appears after the first branch is synchronized." />}
      </section>
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow muted">PAYMENT MIX</span><h3>Recorded collection channels</h3></div><Wallet size={18} className="muted-icon" /></div>
        {[{ label: "Cash sales", value: cashSales }, { label: "Non-cash sales", value: nonCashSales },
          { label: "Cash repayments", value: cashRepayments }, { label: "Non-cash repayments", value: nonCashRepayments }].map((item) =>
          <div className="metric-row" key={item.label}><div><strong>{item.label}</strong><small>{collected > 0 ? (item.value / collected * 100).toFixed(1) : "0.0"}% of recorded collections</small></div>
            <div className="metric-track"><span style={{ width: (collected > 0 ? Math.min(100, item.value / collected * 100) : 0) + "%" }} /></div><b>{money(item.value)}</b>
          </div>)}
      </section>
    </div>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow muted">CASH-CLOSE CONTROL · CLOUD JOURNAL</span><h3>Branch reconciliation history</h3></div><ShieldCheck size={18} className="muted-icon" /></div>
      {reconciliations.length ? <div className="table-wrap"><table><thead><tr><th>Recorded</th><th>Branch</th><th>Period</th><th>Expected cash</th><th>Counted</th><th>Variance</th><th>Owner review</th><th>Recorded by</th></tr></thead><tbody>
        {reconciliations.map(({ event, record }) => <tr key={s(event.id)}>
          <td>{new Date(timestampOf(event, "created_at")).toLocaleString()}</td><td><strong>{s(record?.branchName)}</strong></td>
          <td>{record?.startAt ? new Date(n(record.startAt)).toLocaleDateString() : "—"}</td>
          <td>{money(record?.expectedCashRwf)}</td><td>{money(record?.cashCountedRwf)}</td>
          <td className="strong">{money(record?.varianceRwf)}</td>
          <td><StatusPill value={record?.approvalRequired ? record?.approvalConfirmed ? "OWNER REVIEWED" : "REVIEW REQUIRED" : "WITHIN POLICY"} /></td>
          <td>{s(event.actor) || "Owner"}</td>
        </tr>)}
      </tbody></table></div> : <Empty title="No saved cash close-outs yet" description="Complete a branch cash close-out from Branch management. Saved results are retained in the shop-scoped cloud activity journal." />}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow muted">RECEIVABLES · FINANCIAL EXPOSURE</span><h3>Top customer balances · shop-wide</h3></div><Wallet size={18} className="muted-icon" /></div>
      {customers.filter((customer) => n(customer.debtBalance) > 0).sort((a, b) => n(b.debtBalance) - n(a.debtBalance)).slice(0, 15).length
        ? <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Balance</th><th>Credit limit</th><th>Exposure</th></tr></thead><tbody>
          {customers.filter((customer) => n(customer.debtBalance) > 0).sort((a, b) => n(b.debtBalance) - n(a.debtBalance)).slice(0, 15).map((customer) => {
            const balance = n(customer.debtBalance);
            const limit = n(customer.creditLimit);
            return <tr key={s(customer.id)}><td><strong>{s(customer.name)}</strong></td><td>{s(customer.phone)}</td>
              <td className="strong">{money(balance)}</td><td>{limit > 0 ? money(limit) : "No limit"}</td>
              <td><StatusPill value={limit > 0 && balance > limit ? "OVER LIMIT" : "OPEN"} /></td>
            </tr>;
          })}
        </tbody></table></div> : <Empty title="No outstanding customer balances" description="Customer credit balances are synchronized from the shop snapshot." />}
    </section>
    <div className="info-note"><ShieldCheck size={16} /> Financial view based on signed sales and customer-payment records. "Gross profit" is not net profit: salaries, rent, tax, operating expenses, supplier payments, cash withdrawals and bank deposits require separate verified ledger records before they can be reported as cash-flow or statutory accounts.</div>
  </div>;
}
