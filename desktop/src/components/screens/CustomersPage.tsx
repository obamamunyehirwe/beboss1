import type React from "react";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Check, Clock3, Download,
  Eye, FileSpreadsheet, History, MessageCircle, Pencil, Plus, ReceiptText, Search,
  Upload, Users, Wallet
} from "lucide-react";
import { activeCustomers, dateOnly, downloadCsv, errorText, id, money, n, parseCsv, rows, s } from "../../lib/format";
import type { CommitSnapshot, Row, Snapshot } from "../../lib/types";
import { buildCustomerPaymentRecord, normalizeCustomerPhone, summarizeCustomerActivity } from "../../lib/customer-management";
import { Empty, Modal, PageHeading, StatCard } from "../ui";
import { CustomerPaymentReceiptPreview } from "../CustomerPaymentReceiptPreview";

type CustomerDraft = {
  name: string; phone: string; email: string; address: string; city: string;
  taxIdOrNin: string; category: string; creditLimit: string; notes: string;
};
const EMPTY_DRAFT: CustomerDraft = {
  name: "", phone: "", email: "", address: "", city: "", taxIdOrNin: "",
  category: "Regular Customer", creditLimit: "500000", notes: ""
};
type PaymentDraft = { amount: string; method: string; notes: string };
const PAYMENT_METHODS = ["Cash", "MTN MoMo", "Airtel Money", "Bank", "Card"];

export function CustomersPage({ snapshot, onCommit, offline, query, onReceipt }: {
  snapshot: Snapshot | null; onCommit: CommitSnapshot; offline: boolean; query: string;
  onReceipt?: (sale: Row) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [detailsId, setDetailsId] = useState("");
  const [paymentTarget, setPaymentTarget] = useState<Row | null>(null);
  const [receiptData, setReceiptData] = useState<{ payment: Row; customer: Row; profile: Row } | null>(null);
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_DRAFT);
  const [payment, setPayment] = useState<PaymentDraft>({ amount: "", method: "Cash", notes: "" });
  const [filter, setFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [sort, setSort] = useState("DEBT");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const importInput = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<CustomerDraft[]>([]);
  const [importIssues, setImportIssues] = useState<string[]>([]);
  const [importSkipped, setImportSkipped] = useState(0);
  const [importBusy, setImportBusy] = useState(false);

  const allCustomers = activeCustomers(snapshot);
  const allSales = rows(snapshot?.sales);
  const allPayments = rows(snapshot?.customerPayments);
  const summaries = useMemo(
    () => allCustomers.map((customer) => summarizeCustomerActivity(customer, allSales, allPayments)),
    [allCustomers, allSales, allPayments]
  );

  const filtered = summaries.filter((summary) => {
    const c = summary.customer;
    const matchesSearch = [c.name, c.phone, c.email, c.city, c.taxIdOrNin].some((value) => s(value).toLowerCase().includes(query.toLowerCase()));
    const matchesStatus = filter === "OWES" ? n(c.debtBalance) > 0
      : filter === "OVER_LIMIT" ? summary.overLimit
      : filter === "OVERDUE" ? summary.overdue
      : filter === "CLEAR" ? n(c.debtBalance) <= 0
      : true;
    const matchesCategory = categoryFilter === "ALL" || s(c.category) === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  }).sort((a, b) => sort === "NAME" ? s(a.customer.name).localeCompare(s(b.customer.name))
    : sort === "SPEND" ? b.totalSpend - a.totalSpend
    : sort === "RECENT" ? b.lastActivityAt - a.lastActivityAt
    : n(b.customer.debtBalance) - n(a.customer.debtBalance));

  const details = summaries.find((summary) => s(summary.customer.id) === detailsId);
  const categories = [...new Set(allCustomers.map((customer) => s(customer.category).trim()).filter(Boolean))].sort();
  const totalDebt = allCustomers.reduce((sum, customer) => sum + n(customer.debtBalance), 0);
  const customerLifetimeSpend = summaries.reduce((sum, row) => sum + row.totalSpend, 0);
  const overdueCount = summaries.filter((row) => row.overdue).length;
  const overLimitCount = summaries.filter((row) => row.overLimit).length;

  function openCustomer(customer?: Row) {
    setEditingId(s(customer?.id));
    setDraft(customer ? {
      name: s(customer.name), phone: s(customer.phone), email: s(customer.email), address: s(customer.address),
      city: s(customer.city), taxIdOrNin: s(customer.taxIdOrNin), category: s(customer.category) || "Regular Customer",
      creditLimit: String(customer.creditLimit ?? 500000), notes: s(customer.notes)
    } : EMPTY_DRAFT);
    setError("");
    setEditorOpen(true);
  }

  async function saveCustomer(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) throw new Error("Customer name is required.");
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) throw new Error("Enter a valid email address.");
    const phone = normalizeCustomerPhone(draft.phone);
    const creditLimit = n(draft.creditLimit);
    if (!Number.isFinite(creditLimit) || creditLimit < 0) throw new Error("Credit limit must be zero or greater.");
    const now = Date.now();
    const customerId = editingId || id();
    setSaving(true); setError("");
    try {
      await onCommit((next) => {
        const duplicate = next.customers.find((row) => {
          if (s(row.id) === customerId || row.isDeleted === true || !phone) return false;
          return normalizeCustomerPhone(row.phone) === phone;
        });
        if (duplicate) throw new Error("Another customer already uses this phone number. Open that customer record instead of creating a duplicate.");
        const existing = next.customers.find((row) => s(row.id) === customerId);
        if (editingId && !existing) throw new Error("This customer was changed or removed on another device. Refresh the customer list.");
        const updated = {
          ...(existing ?? {}),
          id: customerId,
          ...draft,
          name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim(),
          address: draft.address.trim(), city: draft.city.trim(), taxIdOrNin: draft.taxIdOrNin.trim(),
          notes: draft.notes.trim(), creditLimit,
          category: draft.category,
          debtBalance: n(existing?.debtBalance),
          isDeleted: false,
          createdAt: n(existing?.createdAt) || now,
          updatedAt: now,
          syncVersion: n(existing?.syncVersion) + 1 || 1,
          hlcTimestamp: 0,
          lastModifiedDeviceId: "DESKTOP"
        };
        if (existing) Object.assign(existing, updated);
        else next.customers.unshift(updated);
      }, editingId ? "CUSTOMER_UPDATE" : "CUSTOMER_CREATE");
      setEditorOpen(false);
      setEditingId("");
    } finally { setSaving(false); }
  }

  async function collect(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentTarget) return;
    const now = Date.now();
    const paymentId = id();
    const receiptNumber = "PAY-" + now.toString().slice(-8) + "-" + paymentId.slice(0, 4).toUpperCase();
    const branchId = s(snapshot?.metadata?.activeBranchId) || "main_branch";
    const branchName = s(snapshot?.branches.find((branch) => s(branch.id) === branchId)?.name) || "Main Branch";
    const result = buildCustomerPaymentRecord({
      customer: paymentTarget,
      amount: n(payment.amount),
      method: payment.method,
      notes: payment.notes,
      paymentId,
      receiptNumber,
      recordedBy: "Desktop Owner",
      branchId,
      branchName,
      now
    });
    setSaving(true); setError("");
    try {
      await onCommit((next) => {
        const customer = next.customers.find((row) => s(row.id) === s(paymentTarget.id) && row.isDeleted !== true);
        if (!customer) throw new Error("The customer record changed. Refresh and retry.");
        const currentDebt = n(customer.debtBalance);
        if (Math.abs(currentDebt - n(result.payment.previousDebt)) > 0.01) {
          throw new Error("The customer's balance changed on another device. Refresh the customer record before collecting payment.");
        }
        customer.debtBalance = n(result.payment.remainingDebt);
        customer.updatedAt = now;
        customer.hlcTimestamp = 0;
        customer.syncVersion = n(customer.syncVersion) + 1;
        customer.lastModifiedDeviceId = "DESKTOP";
        next.customerPayments.unshift(result.payment);
      }, "CUSTOMER_PAYMENT");
      setReceiptData({ payment: result.payment, customer: result.customer, profile: snapshot?.shopProfile ?? {} });
      setPaymentTarget(null);
      setPayment({ amount: "", method: "Cash", notes: "" });
    } finally { setSaving(false); }
  }


  async function readCustomerCsv(file: File) {
    setError("");
    setImportIssues([]);
    setImportPreview([]);
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      throw new Error("Choose a .csv file exported from a spreadsheet or contact manager.");
    }
    if (file.size > 5 * 1024 * 1024) throw new Error("Customer import is limited to 5 MB per file.");
    const csvText = await file.text();
    const matrix = parseCsv(csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText);
    if (matrix.length < 2) throw new Error("The CSV must contain a header row and at least one customer.");
    if (matrix.length > 10001) throw new Error("Import up to 10,000 customer rows per file.");
    const headers = matrix[0].map((value) => { const clean = value.charCodeAt(0) === 0xfeff ? value.slice(1) : value; return clean.trim().toLowerCase().replace(/[^a-z0-9]/g, ""); });
    const aliases: Record<keyof CustomerDraft, string[]> = {
      name: ["name", "customer", "customername", "customerbusinessname", "businessname"],
      phone: ["phone", "phonenumber", "mobile", "mobilephone", "contact", "contactnumber"],
      email: ["email", "emailaddress"],
      address: ["address", "street", "streetaddress"],
      city: ["city", "district", "town"],
      taxIdOrNin: ["taxidornin", "taxid", "nin", "tin"],
      category: ["category", "segment", "customertype"],
      creditLimit: ["creditlimit", "limit"],
      notes: ["notes", "accountnotes", "remarks"]
    };
    const indexes = Object.fromEntries(
      Object.entries(aliases).map(([key, choices]) => [key, headers.findIndex((header) => choices.includes(header))])
    ) as Record<keyof CustomerDraft, number>;
    if (indexes.name < 0) throw new Error("A Name or Customer Name column is required. Download the BeBoss CSV template for the supported columns.");
    const knownPhones = new Set(allCustomers.map((customer) => normalizeCustomerPhone(customer.phone)).filter(Boolean));
    const seenPhones = new Set<string>();
    const valid: CustomerDraft[] = [];
    const issues: string[] = [];
    let skipped = 0;
    const cell = (row: string[], key: keyof CustomerDraft) =>
      indexes[key] >= 0 ? String(row[indexes[key]] ?? "").trim() : "";
    for (let index = 1; index < matrix.length; index++) {
      const row = matrix[index];
      const line = index + 1;
      const name = cell(row, "name");
      const phone = cell(row, "phone");
      const email = cell(row, "email");
      const emailParts = email.split("@");
      const validEmail = !email || (emailParts.length === 2 && !!emailParts[0] && emailParts[1].includes(".") && !email.includes(" "));
      const limitText = cell(row, "creditLimit");
      const creditLimit = limitText === "" ? 500000 : Number(limitText.replace(/[, ]/g, ""));
      const normalizedPhone = normalizeCustomerPhone(phone);
      let issue = "";
      if (!name) issue = "Customer name is missing.";
      else if (!validEmail) issue = "Email address is invalid.";
      else if (!Number.isFinite(creditLimit) || creditLimit < 0) issue = "Credit limit must be zero or greater.";
      else if (normalizedPhone && (knownPhones.has(normalizedPhone) || seenPhones.has(normalizedPhone))) issue = "Phone number already exists in the shop or this file.";
      if (issue) {
        skipped++;
        if (issues.length < 12) issues.push("Row " + line + ": " + issue);
        continue;
      }
      if (normalizedPhone) seenPhones.add(normalizedPhone);
      valid.push({
        name, phone, email, address: cell(row, "address"), city: cell(row, "city"),
        taxIdOrNin: cell(row, "taxIdOrNin"), category: cell(row, "category") || "Regular Customer",
        creditLimit: String(creditLimit), notes: cell(row, "notes")
      });
    }
    if (!valid.length) throw new Error("No valid customers were found. " + skipped + " row(s) were skipped. " + issues.slice(0, 3).join(" "));
    setImportPreview(valid);
    setImportIssues(issues);
    setImportSkipped(skipped);
  }

  async function importCustomers() {
    if (!importPreview.length || importBusy) return;
    const importedCount = importPreview.length;
    const now = Date.now();
    setImportBusy(true);
    setError("");
    try {
      await onCommit((next) => {
        const occupiedPhones = new Set(next.customers
          .filter((customer) => customer.isDeleted !== true)
          .map((customer) => normalizeCustomerPhone(customer.phone))
          .filter(Boolean));
        for (const draftRow of importPreview) {
          const normalizedPhone = normalizeCustomerPhone(draftRow.phone);
          if (normalizedPhone && occupiedPhones.has(normalizedPhone)) {
            throw new Error("A phone number was added on another device while this CSV was being reviewed. Refresh the customer list and import again to avoid duplicates.");
          }
          if (normalizedPhone) occupiedPhones.add(normalizedPhone);
          next.customers.unshift({
            id: id(), ...draftRow, creditLimit: n(draftRow.creditLimit), debtBalance: 0,
            isDeleted: false, createdAt: now, updatedAt: now, syncVersion: 1,
            hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP"
          });
        }
      }, "CUSTOMER_BULK_IMPORT");
      setImportPreview([]);
      setImportIssues([]);
      setImportSkipped(0);
      window.alert(importedCount + " customer(s) imported. New records have a zero balance; existing debt and payment history were not changed.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setImportBusy(false);
    }
  }

  function sendDebtReminder(customer: Row) {
    const rawPhone = s(customer.phone).trim();
    let phone = Array.from(rawPhone).filter((character) => character >= "0" && character <= "9").join("");
    else if (phone.startsWith("00")) phone = phone.slice(2);
    else if (phone.startsWith("0")) phone = "250" + phone.slice(1);
    if (phone.length < 8 || phone.length > 15) {
      setError("Add a valid international phone number before sending a WhatsApp reminder.");
      return;
    }
    const shopName = s(snapshot?.shopProfile?.shopName || snapshot?.shopProfile?.shop_name) || "BeBoss";
    const message = "Hello " + s(customer.name) + ", this is " + shopName +
      ". Our records show an outstanding balance of " + money(customer.debtBalance) +
      ". Please contact us to arrange settlement. If you have already paid, please ignore this reminder. Thank you.";
    const url = "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
    void window.beBossDesktop.openExternal(url).catch((e) => setError("WhatsApp could not be opened: " + errorText(e)));
  }

  return <div className="page-stack">
    <PageHeading title="Customer relationship management" description="Customer profiles, lifetime value, purchase history, outstanding credit, aging, collection and payment receipts — synchronized through the shared BeBoss shop record." action={<div className="heading-actions">
      <button className="btn-outline" onClick={() => downloadCsv("beboss-customers-template.csv", ["name","phone","email","address","city","taxIdOrNin","category","creditLimit","notes"], [])}><FileSpreadsheet size={15}/> CSV template</button>
      <button className="btn-outline" onClick={() => downloadCsv("beboss-customers-" + Date.now() + ".csv", ["id","name","phone","email","address","city","taxIdOrNin","category","creditLimit","debtBalance","notes"], filtered.map((row) => row.customer))}><Download size={15}/> Export filtered customers</button>
      <button className="btn-outline" onClick={() => importInput.current?.click()} disabled={importBusy}><Upload size={15}/> Import CSV</button>
      <input ref={importInput} type="file" accept=".csv,text/csv" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void readCustomerCsv(file).catch((e) => setError(errorText(e))); event.currentTarget.value = ""; }}/>
      <button className="btn-primary" onClick={() => openCustomer()}><Plus size={17}/> Add customer</button>
    </div>}/>
    {offline && <div className="inline-alert"><Clock3 size={14}/>Customer changes are saved in the encrypted local outbox and will sync when the network returns.</div>}
    <div className="stat-grid four">
      <StatCard label="Active customers" value={allCustomers.length.toLocaleString()} icon={Users}/>
      <StatCard label="Lifetime sales to customers" value={money(customerLifetimeSpend)} icon={ArrowUpRight} tone="green"/>
      <StatCard label="Outstanding receivables" value={money(totalDebt)} icon={Wallet} tone="orange"/>
      <StatCard label="Overdue / over limit" value={overdueCount + " / " + overLimitCount} icon={AlertTriangle} tone={overdueCount + overLimitCount > 0 ? "red" : "green"}/>
    </div>
    <div className="panel crm-filter-panel">
      <div className="crm-filter-row">
        <div className="crm-filter-search"><Search size={16}/><input value={query} readOnly placeholder="Search from the global search bar"/></div>
        <select aria-label="Filter customer balance" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="ALL">All customers</option><option value="OWES">Has outstanding balance</option><option value="OVERDUE">Overdue 30+ days</option><option value="OVER_LIMIT">Over credit limit</option><option value="CLEAR">No outstanding balance</option>
        </select>
        <select aria-label="Filter customer category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
          <option value="ALL">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select aria-label="Sort customers" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="DEBT">Highest balance</option><option value="NAME">Customer name</option><option value="SPEND">Lifetime spend</option><option value="RECENT">Recent activity</option>
        </select>
      </div>
      <div className="crm-filter-foot"><span>{filtered.length.toLocaleString()} customer records</span><span>{filtered.filter((row) => row.customer.phone).length} with phone numbers</span></div>
    </div>
    <div className="panel table-panel">
      <div className="table-wrap"><table className="crm-table">
        <thead><tr><th>Customer</th><th>Segment</th><th>Contact</th><th>Purchases</th><th>Lifetime value</th><th>Credit limit</th><th>Outstanding</th><th>Credit use</th><th>Last activity</th><th>Actions</th></tr></thead>
        <tbody>{filtered.map((row) => {
          const c = row.customer, due = n(c.debtBalance), limit = n(c.creditLimit);
          const utilization = limit > 0 ? Math.min(150, due / limit * 100) : 0;
          return <tr key={s(c.id)}>
            <td><strong>{s(c.name)}</strong><small className="cell-sub">{s(c.email) || s(c.city) || "Customer profile"}</small></td>
            <td><span className="crm-category">{s(c.category) || "Regular Customer"}</span></td>
            <td>{s(c.phone) || "—"}</td><td>{row.customerSales.length}</td><td>{money(row.totalSpend)}</td><td>{limit > 0 ? money(limit) : "No limit"}</td>
            <td className={due > 0 ? "strong" : ""}>{money(due)}</td>
            <td><div className="util-bar"><span className={row.overLimit ? "over" : ""} style={{ width: Math.min(100, utilization) + "%" }}/></div><small>{limit > 0 ? Math.round(utilization) + "%" : "—"}</small></td>
            <td>{row.lastActivityAt ? dateOnly(row.lastActivityAt) : "—"}{row.overdue && <small className="crm-overdue">30+ days overdue</small>}</td>
            <td><div className="crm-row-actions">
              <button className="btn-outline small" title="View customer history" onClick={() => setDetailsId(s(c.id))}><Eye size={13}/></button>
              <button className="btn-outline small" title="Edit customer" onClick={() => openCustomer(c)}><Pencil size={13}/></button>
              {due > 0 && <button className="btn-outline small" title="Prepare WhatsApp debt reminder" onClick={() => sendDebtReminder(c)} disabled={!s(c.phone)}><MessageCircle size={13}/> Remind</button>}
              {due > 0 && <button className="btn-primary small" onClick={() => { setPaymentTarget(c); setPayment({ amount: "", method: "Cash", notes: "" }); }}>Collect</button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>
      {!filtered.length && <Empty title="No matching customer records" description="Create a customer or change the filters. Records from your Android terminal appear here after synchronization."/>}
    </div>

    {importPreview.length > 0 && <Modal title="Review customer CSV import" onClose={() => { if (!importBusy) { setImportPreview([]); setImportIssues([]); } }}>
      <div className="customer-import-review">
        <div className="customer-import-metrics"><strong>{importPreview.length.toLocaleString()} ready to import</strong><span>{importSkipped.toLocaleString()} skipped</span></div>
        <p>New customers are added with zero outstanding debt. Existing customer balances, sales and payment history are never overwritten.</p>
        {importIssues.length > 0 && <div className="inline-alert error"><AlertTriangle size={14}/><div><strong>Review skipped rows</strong>{importIssues.map((issue) => <small key={issue}>{issue}</small>)}{importSkipped > importIssues.length && <small>Plus {importSkipped - importIssues.length} additional skipped row(s).</small>}</div></div>}
        <div className="customer-import-sample"><strong>Preview</strong>{importPreview.slice(0, 5).map((item, index) => <div key={index}><span>{item.name}</span><small>{item.phone || "No phone"} · {item.category}</small></div>)}</div>
        <div className="modal-actions"><button type="button" className="btn-outline" disabled={importBusy} onClick={() => { setImportPreview([]); setImportIssues([]); }}>Cancel</button><button type="button" className="btn-primary" disabled={importBusy} onClick={() => void importCustomers()}><Upload size={15}/>{importBusy ? "Importing…" : "Import " + importPreview.length + " customers"}</button></div>
      </div>
    </Modal>}

    {editorOpen && <Modal title={editingId ? "Edit customer profile" : "Create customer profile"} onClose={() => { if (!saving) setEditorOpen(false); }}>
      <form className="form-grid" onSubmit={(event) => saveCustomer(event).catch((e) => setError(errorText(e)))}>
        {error && <div className="inline-alert error field-wide">{error}</div>}
        <label className="field-wide">Customer / business name<input required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label>
        <label>Phone number<input maxLength={32} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })}/></label>
        <label>Email address<input type="email" maxLength={160} value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })}/></label>
        <label>Customer segment<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{["Regular Customer","Wholesaler / Trader","VIP Credit Partner","Walk-in Shopper"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Credit limit (FRw)<input type="number" min="0" step="1" value={draft.creditLimit} onChange={(event) => setDraft({ ...draft, creditLimit: event.target.value })}/></label>
        <label className="field-wide">Street / address<input maxLength={220} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })}/></label>
        <label>City / district<input maxLength={100} value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })}/></label>
        <label>Tax ID / NIN<input maxLength={100} value={draft.taxIdOrNin} onChange={(event) => setDraft({ ...draft, taxIdOrNin: event.target.value })}/></label>
        <label className="field-wide">Account notes<input maxLength={1000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })}/></label>
        <div className="modal-actions field-wide"><button type="button" className="btn-outline" disabled={saving} onClick={() => setEditorOpen(false)}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? "Saving…" : <><Check size={16}/>{editingId ? "Save profile changes" : "Create customer"}</>}</button></div>
      </form>
    </Modal>}

    {paymentTarget && <Modal title={"Collect payment · " + s(paymentTarget.name)} onClose={() => { if (!saving) setPaymentTarget(null); }}>
      <form className="form-grid" onSubmit={(event) => collect(event).catch((e) => setError(errorText(e)))}>
        {error && <div className="inline-alert error field-wide">{error}</div>}
        <div className="field-wide debt-summary"><span>Current outstanding balance</span><strong>{money(paymentTarget.debtBalance)}</strong><small>Record only money actually received by the shop.</small></div>
        <label>Amount received (FRw)<input type="number" min="1" max={n(paymentTarget.debtBalance)} step="1" required value={payment.amount} onChange={(event) => setPayment({ ...payment, amount: event.target.value })}/></label>
        <label>Payment channel<select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></label>
        <label className="field-wide">Transaction reference / notes<input maxLength={180} value={payment.notes} onChange={(event) => setPayment({ ...payment, notes: event.target.value })}/></label>
        <div className="modal-actions field-wide"><button type="button" className="btn-outline" disabled={saving} onClick={() => setPaymentTarget(null)}>Cancel</button><button className="btn-primary" disabled={saving || n(payment.amount) <= 0 || n(payment.amount) > n(paymentTarget.debtBalance)}><Wallet size={16}/>{saving ? "Recording…" : "Record received payment"}</button></div>
      </form>
    </Modal>}

    {details && <Modal title={s(details.customer.name) + " · Customer profile"} onClose={() => setDetailsId("")}>
      <div className="crm-detail">
        <div className="crm-detail-head"><div><span className="crm-category">{s(details.customer.category)}</span><h3>{s(details.customer.phone) || "No phone registered"}</h3><p>{[details.customer.email, details.customer.city, details.customer.address].filter(Boolean).join(" · ") || "No additional contact information"}</p></div><div className="crm-detail-actions">{n(details.customer.debtBalance) > 0 && <button className="btn-outline" onClick={() => sendDebtReminder(details.customer)} disabled={!s(details.customer.phone)}><MessageCircle size={14}/> WhatsApp reminder</button>}<button className="btn-outline" onClick={() => { setDetailsId(""); openCustomer(details.customer); }}><Pencil size={14}/> Edit</button>{n(details.customer.debtBalance) > 0 && <button className="btn-primary" onClick={() => { setDetailsId(""); setPaymentTarget(details.customer); }}>Collect</button>}</div></div>
        <div className="stat-grid four">
          <StatCard label="Lifetime purchases" value={money(details.totalSpend)} icon={ArrowUpRight} tone="green"/>
          <StatCard label="Transactions" value={String(details.customerSales.length)} icon={ReceiptText}/>
          <StatCard label="Outstanding" value={money(details.customer.debtBalance)} icon={Wallet} tone="orange"/>
          <StatCard label="Average order" value={money(details.averageOrder)} icon={ArrowDownRight}/>
        </div>
        {s(details.customer.notes) && <div className="crm-notes"><strong>Account notes</strong><p>{s(details.customer.notes)}</p></div>}
        <section className="crm-history-section"><h4><History size={15}/> Purchase history</h4>
          <div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Payment</th><th>Paid</th><th>Total</th><th>Status</th><th/></tr></thead><tbody>
            {details.customerSales.slice().sort((a,b)=>n(b.saleDate)-n(a.saleDate)).slice(0,50).map((sale) => <tr key={s(sale.id)}><td>{s(sale.receiptNumber)}</td><td>{dateOnly(sale.saleDate)}</td><td>{s(sale.paymentMethod)}</td><td>{money(sale.amountPaid)}</td><td>{money(sale.totalAmount)}</td><td><span className="crm-category">{s(sale.paymentStatus)}</span></td><td>{onReceipt && <button className="btn-outline small" onClick={() => onReceipt(sale)}><ReceiptText size={13}/> Receipt</button>}</td></tr>)}
          </tbody></table></div>{!details.customerSales.length && <p className="crm-empty">No purchase transactions have synchronized for this customer.</p>}
        </section>
        <section className="crm-history-section"><h4><Wallet size={15}/> Credit collection history</h4>
          <div className="table-wrap"><table><thead><tr><th>Payment receipt</th><th>Date</th><th>Method</th><th>Previous debt</th><th>Received</th><th>Remaining</th><th>Receipt</th></tr></thead><tbody>
            {details.customerPayments.slice().sort((a,b)=>n(b.paymentDate)-n(a.paymentDate)).slice(0,50).map((row) => <tr key={s(row.id)}><td>{s(row.receiptNumber)}</td><td>{dateOnly(row.paymentDate)}</td><td>{s(row.paymentMethod)}</td><td>{money(row.previousDebt)}</td><td className="strong">{money(row.amount)}</td><td>{money(row.remainingDebt)}</td><td><button className="btn-outline small" onClick={() => { setDetailsId(""); setReceiptData({ payment: row, customer: details.customer, profile: snapshot?.shopProfile ?? {} }); }}><ReceiptText size={13}/> Receipt</button></td></tr>)}
          </tbody></table></div>{!details.customerPayments.length && <p className="crm-empty">No credit collection records yet.</p>}
        </section>
      </div>
    </Modal>}

    {receiptData && <CustomerPaymentReceiptPreview receipt={receiptData} onClose={() => setReceiptData(null)}/>}
  </div>;
}
