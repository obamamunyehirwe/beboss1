import type React from "react";
import { useState } from "react";
import { Activity, AlertTriangle, Bell, CreditCard, LoaderCircle, ShieldCheck, Smartphone } from "lucide-react";
import { dateOnly, dateTime, errorText, money, n, rows, s } from "../../lib/format";
import type { CloudState, NavKey, Row } from "../../lib/types";
import { Empty, Modal, PageHeading, StatusPill } from "../ui";

export function BillingPage({ cloud, onNavigate, onCheckout }: {
  cloud: CloudState;
  onNavigate: (view: NavKey) => void;
  onCheckout: (payload: Row) => Promise<void>;
}) {
  const shop = cloud.shop;
  const payments = rows(cloud.payments);
  const codes = rows(cloud.codes);
  const expired = n(shop.subscription_expires_at) < Date.now();
  const [renewOpen, setRenewOpen] = useState(false);
  const [gateway, setGateway] = useState("flutterwave");
  const [months, setMonths] = useState("1");
  const [payerPhone, setPayerPhone] = useState(s(shop.owner_phone));
  const [payerName, setPayerName] = useState(s(shop.owner_name) || s(shop.owner_username));
  const [payerEmail, setPayerEmail] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const billingMonths = n(months);
  const monthly = n(shop.monthly_fee_rwf);
  const gross = monthly * billingMonths;
  const discount = billingMonths === 12 ? 20 : billingMonths === 3 ? 10 : 0;
  const estimatedTotal = gross - Math.floor(gross * discount / 100);
  async function submitCheckout(event: React.FormEvent) {
    event.preventDefault();
    setCheckoutBusy(true); setCheckoutError(""); setCheckoutNotice("");
    try {
      await onCheckout({ gateway, months: billingMonths, payerPhone, payerName, payerEmail });
      setRenewOpen(false);
    } catch (error) {
      setCheckoutError(errorText(error));
    } finally { setCheckoutBusy(false); }
  }
  return <div className="page-stack"><PageHeading title="Subscription & payments" description="Review the active shop plan, payment claims and issued activation records." action={<><button className="btn-outline" onClick={() => onNavigate("devices")}><Smartphone size={16} /> Manage devices</button><button className="btn-primary" onClick={() => setRenewOpen(true)}><CreditCard size={16} /> Renew or upgrade</button></>} />
    <section className="plan-card"><div><span className="eyebrow">CURRENT SHOP PLAN</span><h2>{s(shop.subscription_status) || "UNAVAILABLE"}</h2><p>{s(shop.shop_name)} · {s(shop.business_type) || "Retail"}</p></div><div className="plan-expiry"><span>Subscription expiry</span><strong>{dateTime(shop.subscription_expires_at)}</strong><StatusPill value={expired ? "EXPIRED" : s(shop.subscription_status) || "TRIAL"} /></div><div className="plan-summary"><span>Monthly plan price</span><strong>{money(shop.monthly_fee_rwf)}</strong><small>{n(shop.branch_count)} branches · {n(shop.worker_count)} staff · {n(shop.device_count)} devices</small></div></section>
    <div className="two-col"><section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">PAYMENT CLAIMS</span><h3>Recent claims</h3></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Provider</th><th>Amount</th><th>Duration</th><th>Status</th></tr></thead><tbody>{payments.map((p) => <tr key={s(p.id)}><td>{dateOnly(p.created_at)}</td><td>{s(p.provider)}</td><td>{money(p.amount_rwf)}</td><td>{n(p.duration_months)} months</td><td><StatusPill value={s(p.status)} /></td></tr>)}</tbody></table></div>{!payments.length && <Empty title="No payment claims" description="Payment claims submitted for this shop will appear here." />}</section>
    <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">ACTIVATION CODES</span><h3>Issued codes</h3></div></div><div className="table-wrap"><table><thead><tr><th>Plan</th><th>Days</th><th>Status</th><th>Issued</th></tr></thead><tbody>{codes.map((c) => <tr key={s(c.unlock_code)}><td>{s(c.tier_code)}</td><td>{n(c.plan_days)}</td><td><StatusPill value={s(c.status)} /></td><td>{dateOnly(c.issued_at)}</td></tr>)}</tbody></table></div>{!codes.length && <Empty title="No activation codes" description="Verified payment claims and unlock codes are recorded here." />}</section></div>
    <section className="panel announcements"><div className="panel-heading"><div><span className="eyebrow muted">BEBOSS NOTICES</span><h3>Shop announcements</h3></div><Bell size={18} className="muted-icon" /></div>{rows(cloud.announcements).length ? rows(cloud.announcements).map((a) => <div className="announcement-row" key={s(a.id)}><StatusPill value={s(a.severity)} /><div><strong>{s(a.title)}</strong><p>{s(a.body)}</p></div></div>) : <Empty title="No active announcements" description="Important service updates for shop owners appear here." icon={Bell} />}</section>
    {renewOpen && <Modal title="Secure subscription checkout" onClose={() => { if (!checkoutBusy) setRenewOpen(false); }}><form className="form-grid" onSubmit={(event) => submitCheckout(event)}>
      <div className="field-wide checkout-plan-summary">
        <div><span>Current monthly plan</span><strong>{money(monthly)}</strong></div>
        <div><span>Registered usage</span><strong>{n(shop.branch_count)} branches · {n(shop.worker_count)} staff · {n(shop.device_count)} devices</strong></div>
        <div><span>Estimated total</span><strong className="checkout-total">{money(estimatedTotal)}</strong><small>{billingMonths} month{billingMonths === 1 ? "" : "s"} · {discount ? discount + "% multi-month discount" : "no discount"}</small></div>
      </div>
      <label className="field-wide">Payment provider<select value={gateway} onChange={(e) => setGateway(e.target.value)}><option value="flutterwave">Flutterwave · MTN MoMo, Airtel Money or card</option><option value="stripe">Stripe · bank card</option></select></label>
      <label>Billing cycle<select value={months} onChange={(e) => setMonths(e.target.value)}>{[1, 3, 6, 12].map((value) => <option key={value} value={String(value)}>{value} month{value === 1 ? "" : "s"}{value === 3 ? " · 10% discount" : value === 12 ? " · 20% discount" : ""}</option>)}</select></label>
      <label>Payer mobile number<input required value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} placeholder="+250 7XX XXX XXX" /></label>
      <label>Payer full name<input required minLength={2} maxLength={120} value={payerName} onChange={(e) => setPayerName(e.target.value)} /></label>
      <label>Payer email<input required type="email" maxLength={254} value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} placeholder="billing@example.com" /></label>
      {checkoutError && <div className="inline-alert error field-wide"><AlertTriangle size={15} />{checkoutError}</div>}
      {checkoutNotice && <div className="inline-alert info field-wide"><Activity size={15} />{checkoutNotice}</div>}
      <div className="info-note field-wide"><ShieldCheck size={16} /> Payment runs on the provider's secure hosted checkout. BeBoss will activate the subscription only after its verified payment webhook confirms settlement. A browser return or SMS is not proof of payment.</div>
      <div className="modal-actions field-wide"><button type="button" className="btn-outline" disabled={checkoutBusy} onClick={() => setRenewOpen(false)}>Cancel</button><button className="btn-primary" disabled={checkoutBusy}>{checkoutBusy ? <LoaderCircle size={16} className="spin" /> : <CreditCard size={16} />}Continue to hosted checkout</button></div>
    </form></Modal>}
  </div>;
}