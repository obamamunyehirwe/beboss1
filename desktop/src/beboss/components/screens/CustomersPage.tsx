import type React from "react";
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownUp, Check, Clock, Copy, CreditCard, Download, Eye,
  FileText, Mail, MapPin, Pencil, Phone, Plus, PlusCircle, Receipt, ShieldAlert,
  Users, Wallet
} from "lucide-react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activeCustomers, dateOnly, dateTime, downloadCsv, errorText, id, money, n, rows, s } from "../../lib/format";
import type { CommitSnapshot, Row, Snapshot } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard, StatusPill } from "../ui";

type WorkspaceMode = "debit" | "directory" | "payments";
type AgingBucket = "ALL" | "CURRENT" | "WATCH" | "OVERDUE" | "OVER_LIMIT";
type SortKey = "debt_desc" | "spend_desc" | "updated_desc" | "name_asc";

const DAY_MS = 86400000;

function agingBucketFor(days: number): "CURRENT" | "WATCH" | "OVERDUE" {
  if (days <= 7) return "CURRENT";
  if (days <= 30) return "WATCH";
  return "OVERDUE";
}

export function CustomersPage({ snapshot, onCommit, offline, query }: {
  snapshot: Snapshot | null; onCommit: CommitSnapshot; offline: boolean; query: string
}) {
  const [mode, setMode] = useState<WorkspaceMode>("debit");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [filter, setFilter] = useState<"ALL" | "DUE" | "OVER" | "SETTLED">("ALL");
  const [agingFilter, setAgingFilter] = useState<AgingBucket>("ALL");
  const [sortBy, setSortBy] = useState<SortKey>("debt_desc");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("ALL");
  const [paymentTarget, setPaymentTarget] = useState<Row | null>(null);
  const [debitTarget, setDebitTarget] = useState<Row | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", address: "", category: "Regular Customer", creditLimit: "500000", notes: "" });
  const [payment, setPayment] = useState({ amount: "", method: "Cash", notes: "" });
  const [debitCharge, setDebitCharge] = useState({ amount: "", reason: "" });

  const allCustomers = activeCustomers(snapshot);
  const sales = rows(snapshot?.sales);
  const payments = rows(snapshot?.customerPayments);
  const shopName = s(snapshot?.shopProfile?.shopName) || "BeBoss Shop";

  const customerStats = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, { spend: number; count: number; lastActivity: number; oldestUnpaidAt: number }>();
    for (const sale of sales) {
      const key = s(sale.customerId);
      if (!key) continue;
      const dt = n(sale.saleDate);
      const prev = map.get(key) ?? { spend: 0, count: 0, lastActivity: 0, oldestUnpaidAt: 0 };
      prev.spend += n(sale.totalAmount);
      prev.count += 1;
      if (dt > prev.lastActivity) prev.lastActivity = dt;
      const status = s(sale.paymentStatus).toUpperCase();
      if ((status === "UNPAID" || status === "PARTIAL" || status === "CREDIT") && dt > 0) {
        prev.oldestUnpaidAt = prev.oldestUnpaidAt === 0 ? dt : Math.min(prev.oldestUnpaidAt, dt);
      }
      map.set(key, prev);
    }
    for (const p of payments) {
      const key = s(p.customerId);
      if (!key) continue;
      const dt = n(p.paymentDate);
      const prev = map.get(key) ?? { spend: 0, count: 0, lastActivity: 0, oldestUnpaidAt: 0 };
      if (dt > prev.lastActivity) prev.lastActivity = dt;
      map.set(key, prev);
    }
    const enriched = new Map<string, { spend: number; count: number; lastActivity: number; ageDays: number; bucket: "CURRENT" | "WATCH" | "OVERDUE" }>();
    for (const c of allCustomers) {
      const key = s(c.id);
      const info = map.get(key) ?? { spend: 0, count: 0, lastActivity: n(c.updatedAt), oldestUnpaidAt: 0 };
      const refTs = info.oldestUnpaidAt || n(c.updatedAt) || now;
      const ageDays = Math.max(0, Math.floor((now - refTs) / DAY_MS));
      enriched.set(key, { spend: info.spend, count: info.count, lastActivity: info.lastActivity || n(c.updatedAt), ageDays, bucket: agingBucketFor(ageDays) });
    }
    return enriched;
  }, [allCustomers, sales, payments]);

  const matchesSearch = (c: Row) => !query.trim() || [c.name, c.phone, c.email, c.address, c.category].some((v) => s(v).toLowerCase().includes(query.toLowerCase()));

  const sortCustomers = (items: Row[]) => [...items].sort((a, b) => {
    if (sortBy === "debt_desc") return n(b.debtBalance) - n(a.debtBalance);
    if (sortBy === "spend_desc") return (customerStats.get(s(b.id))?.spend ?? 0) - (customerStats.get(s(a.id))?.spend ?? 0);
    if (sortBy === "updated_desc") return n(b.updatedAt) - n(a.updatedAt);
    return s(a.name).localeCompare(s(b.name));
  });

  const directoryList = useMemo(() => {
    const filtered = allCustomers.filter((c) => {
      if (!matchesSearch(c)) return false;
      const due = n(c.debtBalance), limit = n(c.creditLimit);
      if (filter === "DUE") return due > 0;
      if (filter === "OVER") return limit > 0 && due > limit;
      if (filter === "SETTLED") return due <= 0;
      return true;
    });
    return sortCustomers(filtered);
  }, [allCustomers, query, filter, sortBy, customerStats]);

  const debtorsAll = useMemo(() => allCustomers.filter((c) => n(c.debtBalance) > 0), [allCustomers]);

  const agingSummary = useMemo(() => {
    const totals = { CURRENT: 0, WATCH: 0, OVERDUE: 0, currentCount: 0, watchCount: 0, overdueCount: 0 };
    for (const c of debtorsAll) {
      const due = n(c.debtBalance);
      const bucket = customerStats.get(s(c.id))?.bucket ?? "CURRENT";
      totals[bucket] += due;
      if (bucket === "CURRENT") totals.currentCount += 1;
      else if (bucket === "WATCH") totals.watchCount += 1;
      else totals.overdueCount += 1;
    }
    return totals;
  }, [debtorsAll, customerStats]);

  const debitList = useMemo(() => {
    const filtered = debtorsAll.filter((c) => {
      if (!matchesSearch(c)) return false;
      const due = n(c.debtBalance), limit = n(c.creditLimit);
      const bucket = customerStats.get(s(c.id))?.bucket ?? "CURRENT";
      if (agingFilter === "OVER_LIMIT") return limit > 0 && due > limit;
      if (agingFilter !== "ALL") return bucket === agingFilter;
      return true;
    });
    return sortCustomers(filtered);
  }, [debtorsAll, query, agingFilter, sortBy, customerStats]);

  const topDebtorChart = useMemo(() => (
    [...debtorsAll]
      .sort((a, b) => n(b.debtBalance) - n(a.debtBalance))
      .slice(0, 6)
      .map((c) => {
        const due = n(c.debtBalance), limit = n(c.creditLimit);
        return { name: s(c.name).split(" ").slice(0, 2).join(" "), amount: due, over: limit > 0 && due > limit };
      })
  ), [debtorsAll]);

  const filteredPayments = useMemo(() => (
    [...payments]
      .sort((a, b) => n(b.paymentDate) - n(a.paymentDate))
      .filter((p) => {
        if (paymentMethodFilter !== "ALL" && s(p.paymentMethod) !== paymentMethodFilter) return false;
        if (!query.trim()) return true;
        return [p.customerName, p.receiptNumber, p.paymentMethod, p.notes].some((v) => s(v).toLowerCase().includes(query.toLowerCase()));
      })
  ), [payments, paymentMethodFilter, query]);

  function openCustomer(c?: Row) {
    setEditing(c ?? null);
    setDraft({ name: s(c?.name), phone: s(c?.phone), email: s(c?.email), address: s(c?.address), category: s(c?.category) || "Regular Customer", creditLimit: String(c?.creditLimit ?? 500000), notes: s(c?.notes) });
    setOpen(true);
  }

  async function saveCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.name.trim()) throw new Error("Customer name is required.");
    const now = Date.now();
    if (editing) {
      const targetId = s(editing.id);
      await onCommit((next) => {
        const existing = next.customers.find((row) => s(row.id) === targetId);
        if (!existing) throw new Error("The customer record changed. Refresh and retry.");
        existing.name = draft.name.trim();
        existing.phone = draft.phone.trim();
        existing.email = draft.email.trim();
        existing.address = draft.address.trim();
        existing.category = draft.category.trim() || "Regular Customer";
        existing.creditLimit = Math.max(0, n(draft.creditLimit));
        existing.notes = draft.notes.trim();
        existing.updatedAt = now;
        existing.syncVersion = n(existing.syncVersion) + 1;
        existing.lastModifiedDeviceId = "DESKTOP";
      });
    } else {
      const customer = {
        id: id(), name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim(), address: draft.address.trim(),
        city: "", taxIdOrNin: "", category: draft.category.trim() || "Regular Customer", creditLimit: Math.max(0, n(draft.creditLimit)), notes: draft.notes.trim(),
        debtBalance: 0, isDeleted: false, createdAt: now, updatedAt: now, syncVersion: 1, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP"
      };
      await onCommit((next) => next.customers.unshift(customer));
    }
    setEditing(null);
    setOpen(false);
  }

  async function collect(e: React.FormEvent) {
    e.preventDefault();
    const target = paymentTarget!;
    const amount = n(payment.amount);
    if (amount <= 0 || amount > n(target.debtBalance)) throw new Error("Enter a payment greater than zero and no larger than the outstanding debt.");
    const now = Date.now();
    await onCommit((next) => {
      const c = next.customers.find((row) => s(row.id) === s(target.id));
      if (!c) throw new Error("The customer record changed. Refresh and retry.");
      const previous = n(c.debtBalance);
      c.debtBalance = Math.max(0, previous - amount); c.updatedAt = now; c.hlcTimestamp = 0; c.syncVersion = n(c.syncVersion) + 1; c.lastModifiedDeviceId = "DESKTOP";
      next.customerPayments.unshift({ id: id(), customerId: s(c.id), customerName: s(c.name), amount, previousDebt: previous, remainingDebt: c.debtBalance,
        paymentMethod: payment.method, notes: payment.notes.trim(), receiptNumber: "PAY-" + now.toString().slice(-8), paymentDate: now,
        recordedBy: "Desktop Owner", branchId: "main_branch", branchName: "Main Branch" });
    });
    setPaymentTarget(null); setPayment({ amount: "", method: "Cash", notes: "" });
  }

  async function recordDebit(e: React.FormEvent) {
    e.preventDefault();
    const target = debitTarget!;
    const amount = n(debitCharge.amount);
    if (amount <= 0) throw new Error("Enter a debit amount greater than zero.");
    const now = Date.now();
    await onCommit((next) => {
      const c = next.customers.find((row) => s(row.id) === s(target.id));
      if (!c) throw new Error("The customer record changed. Refresh and retry.");
      c.debtBalance = n(c.debtBalance) + amount;
      if (debitCharge.reason.trim()) {
        const stamp = new Date(now).toLocaleDateString();
        c.notes = [s(c.notes), `[Debit ${stamp}: +${money(amount)} — ${debitCharge.reason.trim()}]`].filter(Boolean).join(" | ");
      }
      c.updatedAt = now; c.hlcTimestamp = 0; c.syncVersion = n(c.syncVersion) + 1; c.lastModifiedDeviceId = "DESKTOP";
    });
    setDebitTarget(null); setDebitCharge({ amount: "", reason: "" });
  }

  async function copyReminder(c: Row) {
    const msg = `Hello ${s(c.name)}, friendly reminder from ${shopName}: your current credit balance is ${money(c.debtBalance)}. Please settle via Cash, MTN MoMo, or Bank transfer. Thank you!`;
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedId(s(c.id));
      window.setTimeout(() => setCopiedId((prev) => (prev === s(c.id) ? null : prev)), 2000);
    } catch {
      window.prompt("Copy reminder message:", msg);
    }
  }

  function exportStatement(c: Row) {
    const cSales = sales.filter((sale) => s(sale.customerId) === s(c.id)).map((sale) => ({
      date: dateTime(sale.saleDate), type: "SALE", ref: s(sale.receiptNumber), method: s(sale.paymentMethod), amount: n(sale.totalAmount), status: s(sale.paymentStatus)
    }));
    const cPays = payments.filter((p) => s(p.customerId) === s(c.id)).map((p) => ({
      date: dateTime(p.paymentDate), type: "PAYMENT", ref: s(p.receiptNumber), method: s(p.paymentMethod), amount: -n(p.amount), status: "COLLECTED"
    }));
    downloadCsv(`statement-${s(c.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}.csv`, ["date", "type", "ref", "method", "amount", "status"], [...cSales, ...cPays]);
  }

  const totalReceivable = allCustomers.reduce((sum, c) => sum + n(c.debtBalance), 0);
  const totalLimit = allCustomers.reduce((sum, c) => sum + n(c.creditLimit), 0);
  const overLimitCount = allCustomers.filter((c) => n(c.creditLimit) > 0 && n(c.debtBalance) > n(c.creditLimit)).length;
  const totalCollected = payments.reduce((sum, p) => sum + n(p.amount), 0);
  const collectionRate = totalCollected + totalReceivable > 0 ? Math.round((totalCollected / (totalCollected + totalReceivable)) * 100) : 100;

  const activeDetail = selected ? allCustomers.find((c) => s(c.id) === s(selected.id)) ?? selected : null;
  const detailSales = activeDetail ? sales.filter((sale) => s(sale.customerId) === s(activeDetail.id)).sort((a, b) => n(b.saleDate) - n(a.saleDate)) : [];
  const detailPayments = activeDetail ? payments.filter((p) => s(p.customerId) === s(activeDetail.id)).sort((a, b) => n(b.paymentDate) - n(a.paymentDate)) : [];

  return <div className="page-stack">
    <PageHeading
      eyebrow="RECEIVABLES & CUSTOMER CRM"
      title="Debit & customer management"
      description="Control receivables aging, credit limits, partial or full settlements, debit adjustments, and complete Customer 360 statements."
      action={<div className="heading-actions">
        <button className="btn-outline" onClick={() => downloadCsv(
          mode === "payments" ? "beboss-collections-" + Date.now() + ".csv" : "beboss-customers-" + Date.now() + ".csv",
          mode === "payments" ? ["receiptNumber", "paymentDate", "customerName", "amount", "previousDebt", "remainingDebt", "paymentMethod", "notes"] : ["id", "name", "phone", "email", "address", "category", "creditLimit", "debtBalance", "notes"],
          mode === "payments" ? filteredPayments : directoryList
        )}><Download size={15} /> Export CSV</button>
        <button className="btn-primary" onClick={() => openCustomer()}><Plus size={17} /> Add customer</button>
      </div>}
    />

    <div className="stat-grid four">
      <StatCard label="Outstanding debit" value={money(totalReceivable)} sub={debtorsAll.length + " active debtor" + (debtorsAll.length === 1 ? "" : "s")} icon={Wallet} tone="orange" />
      <StatCard label="Collected to date" value={money(totalCollected)} sub={collectionRate + "% recovery rate · " + payments.length + " receipts"} icon={Receipt} tone="green" />
      <StatCard label="Over credit limit" value={String(overLimitCount)} sub={totalLimit > 0 ? Math.round((totalReceivable / totalLimit) * 100) + "% portfolio utilization" : "Monitor risk accounts"} icon={AlertTriangle} tone="red" />
      <StatCard label="Customer directory" value={allCustomers.length.toLocaleString()} sub={offline ? "Local snapshot" : "Synced across branches"} icon={Users} tone="blue" />
    </div>

    <div className="workspace-mode-bar">
      <div className="mode-pill-group" role="tablist" aria-label="Customer and debit views">
        <button type="button" role="tab" aria-selected={mode === "debit"} className={mode === "debit" ? "active" : ""} onClick={() => setMode("debit")}>
          <CreditCard size={15} /> Debit &amp; Collections <span className="mode-count">{debtorsAll.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "directory"} className={mode === "directory" ? "active" : ""} onClick={() => setMode("directory")}>
          <Users size={15} /> Customer Directory <span className="mode-count">{allCustomers.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "payments"} className={mode === "payments" ? "active" : ""} onClick={() => setMode("payments")}>
          <Receipt size={15} /> Collection Ledger <span className="mode-count">{payments.length}</span>
        </button>
      </div>
      {mode !== "payments" && (
        <label className="sort-select">
          <ArrowDownUp size={14} />
          <select aria-label="Sort accounts" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
            <option value="debt_desc">Highest debit first</option>
            <option value="spend_desc">Highest lifetime spend</option>
            <option value="updated_desc">Recently updated</option>
            <option value="name_asc">Name (A–Z)</option>
          </select>
        </label>
      )}
    </div>

    {mode === "debit" && <>
      <div className="debit-intel-grid">
        <section className="panel debit-aging-panel">
          <div className="panel-heading">
            <div><span className="eyebrow muted">RECEIVABLES AGING</span><h3>Debit risk &amp; exposure</h3></div>
            {agingFilter !== "ALL" && <button type="button" className="text-btn" onClick={() => setAgingFilter("ALL")}>Clear filter</button>}
          </div>
          <div className="aging-cards">
            <button type="button" className={"aging-card good" + (agingFilter === "CURRENT" ? " active" : "")} onClick={() => setAgingFilter(agingFilter === "CURRENT" ? "ALL" : "CURRENT")}>
              <span className="aging-head"><Clock size={14} /> 0–7 days</span>
              <strong>{money(agingSummary.CURRENT)}</strong>
              <small>{agingSummary.currentCount} current account{agingSummary.currentCount === 1 ? "" : "s"}</small>
            </button>
            <button type="button" className={"aging-card warn" + (agingFilter === "WATCH" ? " active" : "")} onClick={() => setAgingFilter(agingFilter === "WATCH" ? "ALL" : "WATCH")}>
              <span className="aging-head"><Clock size={14} /> 8–30 days</span>
              <strong>{money(agingSummary.WATCH)}</strong>
              <small>{agingSummary.watchCount} watch account{agingSummary.watchCount === 1 ? "" : "s"}</small>
            </button>
            <button type="button" className={"aging-card bad" + (agingFilter === "OVERDUE" ? " active" : "")} onClick={() => setAgingFilter(agingFilter === "OVERDUE" ? "ALL" : "OVERDUE")}>
              <span className="aging-head"><ShieldAlert size={14} /> 31+ days</span>
              <strong>{money(agingSummary.OVERDUE)}</strong>
              <small>{agingSummary.overdueCount} overdue account{agingSummary.overdueCount === 1 ? "" : "s"}</small>
            </button>
            <button type="button" className={"aging-card risk" + (agingFilter === "OVER_LIMIT" ? " active" : "")} onClick={() => setAgingFilter(agingFilter === "OVER_LIMIT" ? "ALL" : "OVER_LIMIT")}>
              <span className="aging-head"><AlertTriangle size={14} /> Over limit</span>
              <strong>{overLimitCount}</strong>
              <small>Exceeded credit cap</small>
            </button>
          </div>
        </section>

        <section className="panel debit-chart-panel">
          <div className="panel-heading">
            <div><span className="eyebrow muted">TOP DEBTORS</span><h3>Balance concentration</h3></div>
            <span className="muted">{topDebtorChart.length} accounts</span>
          </div>
          {topDebtorChart.length ? <div className="debit-chart-box">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDebtorChart} layout="vertical" margin={{ top: 4, right: 16, left: 6, bottom: 4 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={116} tick={{ fontSize: 12, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(val: number) => money(val)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="amount" radius={[0, 8, 8, 0]} barSize={18}>
                  {topDebtorChart.map((entry) => <Cell key={entry.name} fill={entry.over ? "var(--red)" : "var(--accent)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div> : <Empty title="Zero active debtors" description="All customer accounts are fully settled." icon={Check} />}
        </section>
      </div>

      <div className="panel table-panel">
        <div className="table-panel-head">
          <div><strong>Active debit accounts ({debitList.length})</strong><small>Collect partial/full payments, issue debit charges, or copy payment reminders.</small></div>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Debtor</th><th>Phone</th><th>Aging</th><th>Outstanding</th><th>Credit utilization</th><th>Last activity</th><th>Actions</th></tr></thead><tbody>
          {debitList.map((c) => {
            const due = n(c.debtBalance), limit = n(c.creditLimit);
            const info = customerStats.get(s(c.id));
            const pct = limit > 0 ? Math.round((due / limit) * 100) : 0;
            const over = limit > 0 && due > limit;
            const bucket = info?.bucket ?? "CURRENT";
            return <tr key={s(c.id)}>
              <td><button type="button" className="customer-name-btn" onClick={() => setSelected(c)}><strong>{s(c.name)}</strong><small className="cell-sub">{s(c.category) || "Regular"} {over ? "· OVER LIMIT" : ""}</small></button></td>
              <td className="mono">{s(c.phone) || "—"}</td>
              <td><span className={"aging-pill " + bucket.toLowerCase()}>{info?.ageDays ?? 0}d · {bucket}</span></td>
              <td className="strong">{money(due)}</td>
              <td><div className={"util-bar" + (over ? " over" : "")}><span style={{ width: (limit > 0 ? Math.min(100, pct) : 0) + "%" }} /></div><small>{limit > 0 ? pct + "% of " + money(limit) : "No cap"}</small></td>
              <td>{dateOnly(info?.lastActivity || c.updatedAt)}</td>
              <td><div className="row-actions">
                <button type="button" className="btn-primary small" onClick={() => { setPaymentTarget(c); setPayment({ amount: String(due), method: "Cash", notes: "" }); }}><Wallet size={13} /> Collect</button>
                <button type="button" className="icon-btn" title="Add debit charge" onClick={() => { setDebitTarget(c); setDebitCharge({ amount: "", reason: "" }); }}><PlusCircle size={15} /></button>
                <button type="button" className="icon-btn" title="Copy WhatsApp/SMS reminder" onClick={() => copyReminder(c)}>{copiedId === s(c.id) ? <Check size={15} /> : <Copy size={15} />}</button>
                <button type="button" className="icon-btn" title="Customer 360 & statement" onClick={() => setSelected(c)}><Eye size={15} /></button>
              </div></td>
            </tr>;
          })}
        </tbody></table></div>
        {!debitList.length && <Empty title="No matching debit accounts" description="Adjust the aging filter or search query, or all accounts are settled." icon={Check} />}
      </div>
    </>}

    {mode === "directory" && <>
      <div className="toolbar">
        <div className="filter-tabs">
          {([["ALL", "All accounts"], ["DUE", "With balance"], ["OVER", "Over limit"], ["SETTLED", "Settled"]] as const).map(([key, label]) => (
            <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <span className="muted">{directoryList.length} customer{directoryList.length === 1 ? "" : "s"} shown</span>
      </div>
      <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Lifetime spend</th><th>Credit limit</th><th>Outstanding</th><th>Utilization</th><th>Updated</th><th></th></tr></thead><tbody>
        {directoryList.map((c) => {
          const due = n(c.debtBalance), limit = n(c.creditLimit);
          const info = customerStats.get(s(c.id));
          const pct = limit > 0 ? Math.round((due / limit) * 100) : 0;
          const over = limit > 0 && due > limit;
          return <tr key={s(c.id)}>
            <td><button type="button" className="customer-name-btn" onClick={() => setSelected(c)}><strong>{s(c.name)}</strong><small className="cell-sub">{s(c.category) || "Regular"} · {s(c.email) || "No email"}</small></button></td>
            <td className="mono">{s(c.phone) || "—"}</td>
            <td><strong>{money(info?.spend ?? 0)}</strong><small className="cell-sub">{info?.count ?? 0} orders</small></td>
            <td>{money(limit)}</td>
            <td className="strong">{money(due)}</td>
            <td><div className={"util-bar" + (over ? " over" : "")}><span style={{ width: (limit > 0 ? Math.min(100, pct) : 0) + "%" }} /></div><small>{limit > 0 ? pct + "%" : "No limit"}</small></td>
            <td>{dateOnly(c.updatedAt)}</td>
            <td><div className="row-actions">
              <button type="button" className="icon-btn" title="View customer 360 profile" onClick={() => setSelected(c)}><Eye size={15} /></button>
              <button type="button" className="icon-btn" title="Edit customer" onClick={() => openCustomer(c)}><Pencil size={15} /></button>
              <button type="button" className="icon-btn" title="Add debit charge" onClick={() => { setDebitTarget(c); setDebitCharge({ amount: "", reason: "" }); }}><PlusCircle size={15} /></button>
              {due > 0 && <button type="button" className="btn-outline small" onClick={() => { setPaymentTarget(c); setPayment({ amount: String(due), method: "Cash", notes: "" }); }}>Collect</button>}
            </div></td>
          </tr>;
        })}
      </tbody></table></div>{!directoryList.length && <Empty title="No customer records" description="Customers created on BeBoss terminals will synchronize here." />}</div>
    </>}

    {mode === "payments" && <>
      <div className="toolbar">
        <div className="filter-tabs">
          {["ALL", "Cash", "MTN MoMo", "Airtel Money", "Bank", "Card"].map((method) => (
            <button key={method} className={paymentMethodFilter === method ? "active" : ""} onClick={() => setPaymentMethodFilter(method)}>{method === "ALL" ? "All methods" : method}</button>
          ))}
        </div>
        <span className="muted">{filteredPayments.length} collection{filteredPayments.length === 1 ? "" : "s"} · {money(filteredPayments.reduce((sum, p) => sum + n(p.amount), 0))}</span>
      </div>
      <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Method</th><th className="right">Previous</th><th className="right">Collected</th><th className="right">Remaining</th><th>Notes</th></tr></thead><tbody>
        {filteredPayments.map((p) => (
          <tr key={s(p.id)}>
            <td className="mono">{s(p.receiptNumber) || s(p.id).slice(0, 8)}</td>
            <td>{dateTime(p.paymentDate)}</td>
            <td><strong>{s(p.customerName) || "Customer"}</strong></td>
            <td><StatusPill value={s(p.paymentMethod) || "Cash"} /></td>
            <td className="right">{money(p.previousDebt)}</td>
            <td className="right strong">{money(p.amount)}</td>
            <td className="right">{money(p.remainingDebt)}</td>
            <td className="muted">{s(p.notes) || "—"}</td>
          </tr>
        ))}
      </tbody></table></div>{!filteredPayments.length && <Empty title="No payment collections yet" description="Credit settlements collected from customers appear here." icon={Receipt} />}</div>
    </>}

    {activeDetail && <Modal title={s(activeDetail.name)} onClose={() => setSelected(null)}>
      <div className="customer-detail-stack">
        <div className="customer-detail-meta">
          <span><Phone size={14} /> {s(activeDetail.phone) || "No phone"}</span>
          <span><Mail size={14} /> {s(activeDetail.email) || "No email"}</span>
          {s(activeDetail.address) && <span><MapPin size={14} /> {s(activeDetail.address)}</span>}
        </div>
        <div className="customer-detail-kpis">
          <div><small>Lifetime spend</small><strong>{money(customerStats.get(s(activeDetail.id))?.spend ?? 0)}</strong></div>
          <div><small>Credit limit</small><strong>{money(activeDetail.creditLimit)}</strong></div>
          <div><small>Outstanding debit</small><strong>{money(activeDetail.debtBalance)}</strong></div>
        </div>
        {s(activeDetail.notes) && <p className="customer-detail-notes">{s(activeDetail.notes)}</p>}
        <div className="customer-detail-section">
          <span className="eyebrow muted">RECENT PURCHASES ({detailSales.length})</span>
          {detailSales.length ? <div className="customer-history-list">
            {detailSales.slice(0, 5).map((sale) => <div className="customer-history-row" key={s(sale.id)}>
              <div><strong className="mono">{s(sale.receiptNumber)}</strong><small>{dateTime(sale.saleDate)}</small></div>
              <div><strong>{money(sale.totalAmount)}</strong><StatusPill value={s(sale.paymentStatus) || "PAID"} /></div>
            </div>)}
          </div> : <p className="muted">No purchases linked to this customer yet.</p>}
        </div>
        <div className="customer-detail-section">
          <span className="eyebrow muted">PAYMENT COLLECTIONS ({detailPayments.length})</span>
          {detailPayments.length ? <div className="customer-history-list">
            {detailPayments.slice(0, 5).map((p) => <div className="customer-history-row" key={s(p.id)}>
              <div><strong>{s(p.paymentMethod) || "Payment"}</strong><small>{dateTime(p.paymentDate)}</small></div>
              <div><strong className="strong">{money(p.amount)}</strong></div>
            </div>)}
          </div> : <p className="muted">No credit payments recorded yet.</p>}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-outline" onClick={() => exportStatement(activeDetail)}><FileText size={15} /> Statement CSV</button>
          <button type="button" className="btn-outline" onClick={() => { setSelected(null); openCustomer(activeDetail); }}><Pencil size={15} /> Edit</button>
          <button type="button" className="btn-outline" onClick={() => { setSelected(null); setDebitTarget(activeDetail); setDebitCharge({ amount: "", reason: "" }); }}><PlusCircle size={15} /> Add debit</button>
          {n(activeDetail.debtBalance) > 0 && <button type="button" className="btn-primary" onClick={() => { setSelected(null); setPaymentTarget(activeDetail); setPayment({ amount: String(n(activeDetail.debtBalance)), method: "Cash", notes: "" }); }}><Wallet size={15} /> Collect</button>}
        </div>
      </div>
    </Modal>}

    {open && <Modal title={editing ? "Edit customer" : "Add customer"} onClose={() => { setOpen(false); setEditing(null); }}><form className="form-grid" onSubmit={(e) => saveCustomer(e).catch((x) => alert(errorText(x)))}><label className="field-wide">Customer name<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label>Phone<input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label><label>Email<input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label><label>Segment<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option>Regular Customer</option><option>VIP Retail</option><option>Wholesale</option><option>Corporate</option></select></label><label>Credit limit (FRw)<input type="number" min="0" value={draft.creditLimit} onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value })} /></label><label className="field-wide">Address<input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label><label className="field-wide">Notes<input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</button><button className="btn-primary"><Check size={16} />{editing ? "Update customer" : "Save customer"}</button></div></form></Modal>}

    {paymentTarget && <Modal title={"Collect from " + s(paymentTarget.name)} onClose={() => setPaymentTarget(null)}><form className="form-grid" onSubmit={(e) => collect(e).catch((x) => alert(errorText(x)))}>
      <div className="field-wide debt-summary"><span>Outstanding debit</span><strong>{money(paymentTarget.debtBalance)}</strong></div>
      <div className="field-wide quick-percent-row">
        {[0.25, 0.5, 0.75, 1].map((ratio) => {
          const val = Math.max(1, Math.round(n(paymentTarget.debtBalance) * ratio));
          return <button key={ratio} type="button" className="btn-outline small" onClick={() => setPayment({ ...payment, amount: String(val) })}>{ratio === 1 ? "Full 100%" : Math.round(ratio * 100) + "%"}</button>;
        })}
      </div>
      <label>Amount received (FRw)<input type="number" min="1" max={n(paymentTarget.debtBalance)} required value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} /></label>
      <label>Payment method<select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })}>{["Cash", "MTN MoMo", "Airtel Money", "Bank", "Card"].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label className="field-wide">Reference / notes<input value={payment.notes} onChange={(e) => setPayment({ ...payment, notes: e.target.value })} placeholder="MoMo TxID, bank slip, or cashier note" /></label>
      <div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setPaymentTarget(null)}>Cancel</button><button className="btn-primary"><Wallet size={16} />Record payment</button></div>
    </form></Modal>}

    {debitTarget && <Modal title={"Add debit · " + s(debitTarget.name)} onClose={() => setDebitTarget(null)}><form className="form-grid" onSubmit={(e) => recordDebit(e).catch((x) => alert(errorText(x)))}>
      <div className="field-wide debt-summary"><span>Current debit balance</span><strong>{money(debitTarget.debtBalance)}</strong></div>
      <label className="field-wide">Debit amount to add (FRw)<input type="number" min="1" required value={debitCharge.amount} onChange={(e) => setDebitCharge({ ...debitCharge, amount: e.target.value })} /></label>
      <label className="field-wide">Reason / invoice reference<input required value={debitCharge.reason} onChange={(e) => setDebitCharge({ ...debitCharge, reason: e.target.value })} placeholder="e.g. Wholesale credit invoice #INV-204" /></label>
      <div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setDebitTarget(null)}>Cancel</button><button className="btn-primary"><PlusCircle size={16} />Apply debit</button></div>
    </form></Modal>}
  </div>;
}