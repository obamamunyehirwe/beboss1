import { Activity, ArrowDownRight, ArrowUpRight, Banknote, Download, Filter, Plus, RotateCcw, ShieldCheck, Store, Truck, Wallet } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { downloadCsv, errorText, id, money, n, rows, s } from "../../lib/format";
import type { CloudAction, CloudState, Row, Snapshot } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard, StatusPill } from "../ui";

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

type FinanceJournalEntry = {
  version: 1;
  entryId: string;
  type: string;
  flow: "OUTFLOW" | "INFLOW" | "TRANSFER";
  amountRwf: number;
  account?: string;
  sourceAccount?: string;
  destinationAccount?: string;
  branchId?: string;
  branchName?: string;
  effectiveAt: number;
  counterparty?: string;
  reference?: string;
  note?: string;
  postedAt?: number;
  actorUsername?: string;
  reversalOf?: string;
  originalType?: string;
};

function parseFinanceJournalEvent(event: Row): FinanceJournalEntry | null {
  if (String(event.entity).toUpperCase() !== "FINANCE_LEDGER" ||
      !["POSTED", "REVERSED"].includes(String(event.action).toUpperCase())) return null;
  try {
    const value = JSON.parse(s(event.detail)) as FinanceJournalEntry;
    if (value?.version !== 1 || !value.entryId ||
        !Number.isSafeInteger(value.amountRwf) || value.amountRwf <= 0 ||
        !["OUTFLOW", "INFLOW", "TRANSFER"].includes(value.flow)) return null;
    return value;
  } catch {
    return null;
  }
}

export function FinanceControlPage({ cloud, snapshot, onAction, offline }: {
  cloud: CloudState; snapshot: Snapshot | null; onAction: CloudAction; offline: boolean;
}) {
  const [period, setPeriod] = useState<FinancePeriod>("30D");
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState("");
  const [entryType, setEntryType] = useState("OPERATING_EXPENSE");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryAccount, setEntryAccount] = useState("CASH");
  const [entrySourceAccount, setEntrySourceAccount] = useState("CASH");
  const [entryBranchId, setEntryBranchId] = useState("ALL");
  const [entryDate, setEntryDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [entryCounterparty, setEntryCounterparty] = useState("");
  const [entryReference, setEntryReference] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [reversingId, setReversingId] = useState("");
  

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
  const purchases = rows(snapshot?.purchases).filter((purchase) => {
    const time = timestampOf(purchase, "purchaseDate", "purchase_date");
    return (!startAt || time >= startAt) && branchMatches(purchase);
  }).sort((a, b) => timestampOf(b, "purchaseDate", "purchase_date") - timestampOf(a, "purchaseDate", "purchase_date"));
  const supplierCreditPurchases = purchases.filter((purchase) =>
    s(purchase.paymentStatus ?? purchase.payment_status).toUpperCase() === "SUPPLIER_CREDIT"
  );
  const purchaseSpend = purchases.reduce((sum, purchase) => sum + Math.max(0, n(purchase.totalPurchaseCost ?? purchase.total_purchase_cost)), 0);
  const cashPurchaseSpend = purchases.reduce((sum, purchase) =>
    ["PAID_CASH", "CASH"].includes(s(purchase.paymentStatus ?? purchase.payment_status).toUpperCase())
      ? sum + Math.max(0, n(purchase.totalPurchaseCost ?? purchase.total_purchase_cost)) : sum, 0);
  const momoPurchaseSpend = purchases.reduce((sum, purchase) =>
    ["PAID_MOMO", "MOMO", "PAID_MOBILE_MONEY"].includes(s(purchase.paymentStatus ?? purchase.payment_status).toUpperCase())
      ? sum + Math.max(0, n(purchase.totalPurchaseCost ?? purchase.total_purchase_cost)) : sum, 0);
  const bankPurchaseSpend = purchases.reduce((sum, purchase) =>
    ["PAID_BANK", "BANK", "PAID_TRANSFER"].includes(s(purchase.paymentStatus ?? purchase.payment_status).toUpperCase())
      ? sum + Math.max(0, n(purchase.totalPurchaseCost ?? purchase.total_purchase_cost)) : sum, 0);
  const supplierCreditValue = supplierCreditPurchases.reduce((sum, purchase) =>
    sum + Math.max(0, n(purchase.totalPurchaseCost ?? purchase.total_purchase_cost)), 0);
  const journalAll = rows(cloud.activity).map((event) => ({
    event, entry: parseFinanceJournalEvent(event)
  })).filter((item): item is { event: Row; entry: FinanceJournalEntry } => Boolean(item.entry));
  const reversedEntryIds = new Set(journalAll
    .filter((item) => String(item.event.action).toUpperCase() === "REVERSED")
    .map((item) => item.entry.reversalOf).filter((value): value is string => Boolean(value)));
  const journalEntries = journalAll.filter(({ event, entry }) => {
    const branchId = s(entry.branchId);
    return (!startAt || entry.effectiveAt >= startAt) &&
      (branchFilter === "ALL" || branchId === branchFilter);
  }).sort((a, b) => timestampOf(b.event, "created_at") - timestampOf(a.event, "created_at"));
  const postedOutflowsRwf = journalEntries.reduce((sum, item) =>
    sum + (item.entry.flow === "OUTFLOW" ? item.entry.amountRwf : 0), 0);
  const postedInflowsRwf = journalEntries.reduce((sum, item) =>
    sum + (item.entry.flow === "INFLOW" ? item.entry.amountRwf : 0), 0);
  const postedTransfersRwf = journalEntries.reduce((sum, item) =>
    sum + (item.entry.flow === "TRANSFER" ? item.entry.amountRwf : 0), 0);
  const netPostedMovementRwf = postedInflowsRwf - postedOutflowsRwf;

  function exportJournal() {
    downloadCsv("BeBoss-Financial-Journal-" + new Date().toISOString().slice(0, 10) + ".csv",
      ["event_id","event_action","entry_id","entry_type","flow","amount_rwf","business_date","account","source_account","destination_account","branch","counterparty","reference","note","reversal_of","actor","device_id","recorded_at"],
      journalEntries.map(({ event, entry }) => ({
        event_id: s(event.id), event_action: s(event.action), entry_id: entry.entryId,
        entry_type: entry.type === "REVERSAL" ? entry.originalType : entry.type,
        flow: entry.flow, amount_rwf: entry.amountRwf,
        business_date: new Date(entry.effectiveAt).toISOString(),
        account: entry.account ?? "", source_account: entry.sourceAccount ?? "",
        destination_account: entry.destinationAccount ?? "", branch: entry.branchName ?? "",
        counterparty: entry.counterparty ?? "", reference: entry.reference ?? "",
        note: entry.note ?? "", reversal_of: entry.reversalOf ?? "",
        actor: s(event.actor), device_id: s(event.device_id), recorded_at: s(event.created_at)
      })));
  }

  async function postJournalEntry(event: React.FormEvent) {
    event.preventDefault();
    const amountRwf = Number(entryAmount);
    if (!Number.isSafeInteger(amountRwf) || amountRwf <= 0 || amountRwf > 10000000000) {
      setEntryError("Enter a positive whole-RWF amount up to FRw 10,000,000,000.");
      return;
    }
    const effectiveAt = new Date(entryDate + "T12:00:00").getTime();
    if (!Number.isFinite(effectiveAt) || effectiveAt < Date.UTC(2000, 0, 1) ||
        effectiveAt > Date.now() + 5 * 60 * 1000) {
      setEntryError("Choose a valid business date no later than today.");
      return;
    }
    if (entryType === "BANK_DEPOSIT" && entrySourceAccount === "BANK") {
      setEntryError("A bank deposit must come from Cash, Mobile Money or Other.");
      return;
    }
    setEntryBusy(true);
    setEntryError("");
    try {
      await onAction("finance_ledger_post", {
        entryId: id(), type: entryType, amountRwf, account: entryAccount,
        sourceAccount: entryType === "BANK_DEPOSIT" ? entrySourceAccount : "",
        destinationAccount: entryType === "BANK_DEPOSIT" ? "BANK" : "",
        branchId: entryBranchId === "ALL" ? "" : entryBranchId,
        effectiveAt, counterparty: entryCounterparty, reference: entryReference, note: entryNote
      });
      setEntryAmount(""); setEntryCounterparty(""); setEntryReference(""); setEntryNote("");
      setEntryOpen(false);
    } catch (error) {
      setEntryError(errorText(error));
    } finally {
      setEntryBusy(false);
    }
  }

  async function reverseJournalEntry(entry: FinanceJournalEntry) {
    if (reversedEntryIds.has(entry.entryId)) return;
    const accepted = window.confirm("Reverse this posted entry by adding an opposite financial event? The original history will remain visible.");
    if (!accepted) return;
    const reason = window.prompt("Enter the reversal explanation (at least 8 characters):", "")?.trim() ?? "";
    if (reason.length < 8) {
      if (reason.length) setEntryError("A reversal explanation of at least 8 characters is required.");
      return;
    }
    setReversingId(entry.entryId);
    setEntryError("");
    try {
      await onAction("finance_ledger_reverse", {
        reversalEntryId: id(), originalEntryId: entry.entryId, reason
      });
    } catch (error) {
      setEntryError(errorText(error));
    } finally {
      setReversingId("");
    }
  }

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

  const branchSummary = useMemo(() => branches.map((branch) => {
    const id = s(branch.id);
    const localSales = sales.filter((sale) => branchOf(sale, mainBranchId) === (id || mainBranchId));
    const localPayments = payments.filter((payment) => branchOf(payment, mainBranchId) === (id || mainBranchId));
    const salesTotal = localSales.reduce((sum, sale) => sum + Math.max(0, n(sale.totalAmount ?? sale.total_amount)), 0);
    const collectedTotal = localSales.reduce((sum, sale) => sum + amountCollected(sale), 0) +
      localPayments.reduce((sum, payment) => sum + Math.max(0, n(payment.amount)), 0);
    const localPurchases = purchases.filter((purchase) => branchOf(purchase, mainBranchId) === (id || mainBranchId));
    return {
      id, name: s(branch.name), sales: salesTotal,
      cost: localSales.reduce((sum, sale) => sum + Math.max(0, n(sale.totalCost ?? sale.total_cost)), 0),
      profit: localSales.reduce((sum, sale) => sum + n(sale.totalProfit ?? sale.total_profit), 0),
      purchases: localPurchases.reduce((sum, purchase) => sum + Math.max(0, n(purchase.totalPurchaseCost ?? purchase.total_purchase_cost)), 0),
      collected: collectedTotal, count: localSales.length,
      target: n(branch.monthly_target_rwf), status: s(branch.operational_status) || "OPEN"
    };
  }).filter((branch) => branchFilter === "ALL" || branch.id === branchFilter)
    .sort((a, b) => b.sales - a.sales), [branches, sales, payments, purchases, branchFilter, mainBranchId]);

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
      })),
      ...purchases.map((purchase) => {
        const paymentStatus = s(purchase.paymentStatus ?? purchase.payment_status).toUpperCase();
        const amount = Math.max(0, n(purchase.totalPurchaseCost ?? purchase.total_purchase_cost));
        const paid = ["PAID_CASH","PAID_MOMO","PAID_BANK","CASH","MOMO","BANK","PAID_TRANSFER","PAID_MOBILE_MONEY"].includes(paymentStatus) ? amount : 0;
        return {
          record_type: "INVENTORY_PURCHASE", timestamp: new Date(timestampOf(purchase, "purchaseDate", "purchase_date")).toISOString(),
          branch: branchNames.get(branchOf(purchase, mainBranchId)) || branchOf(purchase, mainBranchId),
          reference: s(purchase.invoiceNumber ?? purchase.invoice_number ?? purchase.id),
          counterparty: s(purchase.supplierName ?? purchase.supplier_name) || "Supplier",
          method: paymentStatus, gross_amount_rwf: amount, collected_amount_rwf: paid,
          cost_rwf: amount, gross_profit_rwf: 0, status: paymentStatus
        };
      })
    ];
    downloadCsv("BeBoss-Consolidated-Finance-" + new Date().toISOString().slice(0, 10) + ".csv",
      ["record_type","timestamp","branch","reference","counterparty","method","gross_amount_rwf","collected_amount_rwf","cost_rwf","gross_profit_rwf","status"],
      rowsForExport);
  }
  function exportBranches() {
    downloadCsv("BeBoss-Branch-Finance-" + new Date().toISOString().slice(0, 10) + ".csv",
      ["branch_id","branch_name","transactions","revenue_rwf","cost_of_goods_rwf","gross_profit_rwf","collections_rwf","monthly_target_rwf","purchase_spend_rwf"],
      branchSummary.map((branch) => ({
        branch_id: branch.id, branch_name: branch.name, transactions: branch.count,
        revenue_rwf: Math.round(branch.sales), cost_of_goods_rwf: Math.round(branch.cost),
        gross_profit_rwf: Math.round(branch.profit), collections_rwf: Math.round(branch.collected),
        monthly_target_rwf: branch.target, purchase_spend_rwf: Math.round(branch.purchases)
      })));
  }

  return <div className="page-stack finance-control-page">
    <PageHeading eyebrow="FINANCE · CONSOLIDATION · CONTROL" title="Financial control"
      description="Consolidated sales, collections, cost of goods, branch comparisons and recorded cash close-outs from the latest signed shop snapshot."
      action={<div className="enterprise-page-actions">
        <button className="btn-outline" onClick={exportBranches}><Download size={15} /> Export branch totals</button>
        <button className="btn-outline" onClick={exportJournal}><Download size={15} /> Export posted journal</button>
        <button className="btn-outline" onClick={() => { setEntryError(""); setEntryOpen(true); }} disabled={offline}><Plus size={15} /> New financial entry</button>
        <button className="btn-primary" onClick={exportFinance}><Download size={15} /> Export sales & purchases</button>
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
      <div className="enterprise-toolbar-foot"><span>{sales.length.toLocaleString()} sales · {payments.length.toLocaleString()} customer repayments · {purchases.length.toLocaleString()} purchases</span><span>Purchase outflows are shown separately from cost of goods sold</span></div>
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
      <StatCard label="Purchase spend" value={money(purchaseSpend)} sub={purchases.length.toLocaleString() + " inventory purchase records"} icon={Store} tone="purple" />
    </div>
    <div className="stat-grid four">
      <StatCard label="Cash purchase spend" value={money(cashPurchaseSpend)} sub="Purchases marked paid in cash" icon={Banknote} />
      <StatCard label="Mobile-money purchases" value={money(momoPurchaseSpend)} sub="Purchases marked paid by MoMo" icon={Activity} tone="blue" />
      <StatCard label="Bank-paid purchases" value={money(bankPurchaseSpend)} sub="Purchases marked paid by bank" icon={ShieldCheck} tone="green" />
      <StatCard label="Supplier-credit purchases" value={money(supplierCreditValue)} sub={supplierCreditPurchases.length.toLocaleString() + " purchases marked supplier credit"} icon={Wallet} tone="orange" />
    </div>
    <div className="stat-grid four">
      <StatCard label="Posted cash outflows" value={money(postedOutflowsRwf)} sub="Expenses, payroll, supplier settlements, taxes and draws (net of reversals)" icon={ArrowDownRight} tone="orange" />
      <StatCard label="Posted cash inflows" value={money(postedInflowsRwf)} sub="Capital contributions and approved reversals" icon={ArrowUpRight} tone="green" />
      <StatCard label="Bank deposits" value={money(postedTransfersRwf)} sub="Cash / mobile money moved to bank" icon={Banknote} tone="blue" />
      <StatCard label="Net posted movement" value={money(netPostedMovementRwf)} sub="Recorded inflows less outflows; not net profit" icon={Wallet} />
    </div>
    <div className="dashboard-grid">
      <section className="panel span-2">
        <div className="panel-heading"><div><span className="eyebrow muted">CONSOLIDATED BRANCH PERFORMANCE</span><h3>Branch finance comparison</h3></div><Store size={18} className="muted-icon" /></div>
        {branchSummary.length ? <div className="table-wrap"><table><thead><tr><th>Branch</th><th>State</th><th>Transactions</th><th>Gross sales</th><th>Cost of goods</th><th>Gross profit</th><th>Collections</th><th>Purchases</th><th>Target</th></tr></thead>
          <tbody>{branchSummary.map((branch) => <tr key={branch.id}>
            <td><strong>{branch.name}</strong><small className="cell-sub mono">{branch.id}</small></td><td><StatusPill value={branch.status} /></td>
            <td>{branch.count}</td><td>{money(branch.sales)}</td><td>{money(branch.cost)}</td>
            <td className="strong">{money(branch.profit)}</td><td>{money(branch.collected)}</td><td>{money(branch.purchases)}</td>
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
      <div className="panel-heading"><div><span className="eyebrow muted">APPEND-ONLY FINANCIAL JOURNAL · CLOUD</span><h3>Posted financial entries ({journalEntries.length})</h3></div><ShieldCheck size={18} className="muted-icon" /></div>
      {entryError && <div className="inline-alert error">{entryError}</div>}
      {journalEntries.length ? <div className="table-wrap"><table><thead><tr>
        <th>Recorded</th><th>Entry</th><th>Flow</th><th>Account</th><th>Branch</th><th>Amount</th><th>Counterparty / note</th><th>Actor</th><th>Correction</th>
      </tr></thead><tbody>
        {journalEntries.map(({ event, entry }) => {
          const action = s(event.action).toUpperCase();
          const title = entry.type === "REVERSAL" ? "REVERSAL · " + s(entry.originalType).replaceAll("_", " ") : entry.type.replaceAll("_", " ");
          const account = entry.flow === "TRANSFER"
            ? (s(entry.sourceAccount) + " → " + s(entry.destinationAccount))
            : s(entry.account);
          const canReverse = action === "POSTED" && entry.type !== "REVERSAL" && !reversedEntryIds.has(entry.entryId);
          return <tr key={s(event.id)}>
            <td>{new Date(timestampOf(event, "created_at")).toLocaleString()}</td>
            <td><strong>{title}</strong><small className="cell-sub mono">{entry.entryId}</small></td>
            <td><StatusPill value={entry.flow} /></td>
            <td>{account || "—"}</td><td>{s(entry.branchName) || "All branches"}</td>
            <td className="strong">{money(entry.amountRwf)}</td>
            <td><strong>{s(entry.counterparty) || "—"}</strong><small className="cell-sub">{s(entry.reference) || s(entry.note) || "—"}</small></td>
            <td>{s(event.actor) || s(entry.actorUsername) || "Owner"}</td>
            <td>{canReverse ? <button type="button" className="btn-outline small" disabled={offline || reversingId === entry.entryId} onClick={() => void reverseJournalEntry(entry)}><RotateCcw size={13} /> Reverse</button>
              : action === "REVERSED" ? <StatusPill value="REVERSED" /> : reversedEntryIds.has(entry.entryId) ? <StatusPill value="HAS REVERSAL" /> : "—"}</td>
          </tr>;
        })}
      </tbody></table></div> : <Empty title="No posted financial entries yet" description="Post an operating expense, payroll, supplier settlement, tax payment, owner draw, cash withdrawal, capital contribution or bank deposit to begin the cloud journal." />}
      <p className="panel-hint">Entries are append-only. Corrections create opposite, separately audited events; original records are never edited or deleted. Net posted movement is not net profit or a double-entry statutory balance sheet.</p>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow muted">SUPPLIER EXPOSURE · PURCHASE REGISTER</span><h3>Supplier purchases and credit exposure</h3></div><Truck size={18} className="muted-icon" /></div>
      {purchases.length ? <div className="table-wrap"><table><thead><tr><th>Supplier</th><th>Purchases</th><th>Total acquired</th><th>Marked paid</th><th>Supplier credit</th></tr></thead><tbody>
        {Object.entries(purchases.reduce<Record<string, { count: number; total: number; paid: number; credit: number }>>((acc, purchase) => {
          const name = s(purchase.supplierName ?? purchase.supplier_name) || "Supplier not specified";
          const key = name.toLowerCase();
          const amount = Math.max(0, n(purchase.totalPurchaseCost ?? purchase.total_purchase_cost));
          const status = s(purchase.paymentStatus ?? purchase.payment_status).toUpperCase();
          const paid = ["PAID_CASH","PAID_MOMO","PAID_BANK","CASH","MOMO","BANK","PAID_TRANSFER","PAID_MOBILE_MONEY"].includes(status);
          const item = acc[key] ?? { count: 0, total: 0, paid: 0, credit: 0 };
          item.count += 1; item.total += amount;
          if (paid) item.paid += amount;
          if (status === "SUPPLIER_CREDIT") item.credit += amount;
          acc[key] = item;
          return acc;
        }, {})).sort((a, b) => b[1].credit - a[1].credit || b[1].total - a[1].total).slice(0, 20).map(([supplier, value]) =>
          <tr key={supplier}><td><strong>{supplier}</strong></td><td>{value.count}</td><td>{money(value.total)}</td><td>{money(value.paid)}</td><td className="strong">{money(value.credit)}</td></tr>
        )}
      </tbody></table></div> : <Empty title="No purchases recorded in this period" description="Purchases from the Android and desktop purchase registers appear here after synchronization." />}
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
    <div className="info-note"><ShieldCheck size={16} /> Sales, repayments and purchases are consolidated from the signed shop snapshot. Additional operating expenses, payroll, supplier settlements, tax, owner draws, withdrawals, capital contributions and bank deposits are now captured in the append-only cloud journal. This is a controlled cash-movement register, not a double-entry general ledger, bank reconciliation, payroll processor, tax filing or statutory net-profit statement.</div>
    {entryOpen && <Modal title="Post financial journal entry" onClose={() => !entryBusy && setEntryOpen(false)}>
      <form className="form-grid" onSubmit={(event) => void postJournalEntry(event)}>
        <label>Entry category
          <select value={entryType} onChange={(event) => setEntryType(event.target.value)} disabled={entryBusy}>
            <option value="OPERATING_EXPENSE">Operating expense</option>
            <option value="PAYROLL_PAYMENT">Payroll payment</option>
            <option value="SUPPLIER_SETTLEMENT">Supplier settlement</option>
            <option value="TAX_PAYMENT">Tax payment</option>
            <option value="OWNER_DRAW">Owner draw</option>
            <option value="CASH_WITHDRAWAL">Cash withdrawal</option>
            <option value="CAPITAL_CONTRIBUTION">Capital contribution</option>
            <option value="BANK_DEPOSIT">Deposit to bank</option>
          </select>
        </label>
        <label>Amount (FRw)<input type="number" min="1" max="10000000000" step="1" required value={entryAmount} onChange={(event) => setEntryAmount(event.target.value)} disabled={entryBusy} /></label>
        {entryType === "BANK_DEPOSIT" ? <label>Deposit source account
          <select value={entrySourceAccount} onChange={(event) => setEntrySourceAccount(event.target.value)} disabled={entryBusy}>
            <option value="CASH">Cash</option><option value="MOBILE_MONEY">Mobile Money</option><option value="OTHER">Other</option>
          </select>
        </label> : <label>Payment account
          <select value={entryAccount} onChange={(event) => setEntryAccount(event.target.value)} disabled={entryBusy}>
            <option value="CASH">Cash</option><option value="BANK">Bank</option><option value="MOBILE_MONEY">Mobile Money</option><option value="OTHER">Other</option>
          </select>
        </label>}
        <label>Business date<input type="date" required value={entryDate} onChange={(event) => setEntryDate(event.target.value)} disabled={entryBusy} /></label>
        <label>Branch
          <select value={entryBranchId} onChange={(event) => setEntryBranchId(event.target.value)} disabled={entryBusy}>
            <option value="ALL">All branches</option>
            {branches.map((branch) => <option key={s(branch.id)} value={s(branch.id)}>{s(branch.name)}</option>)}
          </select>
        </label>
        <label>Supplier / employee / counterparty<input maxLength={100} value={entryCounterparty} onChange={(event) => setEntryCounterparty(event.target.value)} disabled={entryBusy} /></label>
        <label>Reference / receipt<input maxLength={48} value={entryReference} onChange={(event) => setEntryReference(event.target.value)} disabled={entryBusy} /></label>
        <label className="field-wide">Description / explanation<textarea rows={3} maxLength={240} value={entryNote} onChange={(event) => setEntryNote(event.target.value)} disabled={entryBusy} /></label>
        {entryError && <div className="inline-alert error field-wide">{entryError}</div>}
        <div className="field-wide info-note"><ShieldCheck size={15} /> The cloud verifies the owner identity and registered desktop device, enforces tenant scope, and stores this entry as an append-only audit record. Errors keep the form open and never show a false success.</div>
        <div className="modal-actions field-wide">
          <button type="button" className="btn-outline" disabled={entryBusy} onClick={() => setEntryOpen(false)}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={entryBusy || offline || !entryAmount.trim()}>{entryBusy ? "Posting..." : <><Plus size={14} /> Post journal entry</>}</button>
        </div>
      </form>
    </Modal>}
  </div>;
}
