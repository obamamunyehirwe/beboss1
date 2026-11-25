import type React from "react";
import { useState } from "react";
import { Activity, AlertTriangle, Bell, CheckCircle2, Clipboard, CreditCard, LoaderCircle, MessageCircle, ShieldCheck, Smartphone, Wallet } from "lucide-react";
import { dateOnly, dateTime, errorText, money, n, rows, s } from "../../lib/format";
import type { CloudState, NavKey, Row } from "../../lib/types";
import { Empty, Modal, PageHeading, StatusPill } from "../ui";

export function BillingPage({ cloud, onNavigate, onCheckout, onPaymentProof }: {
  cloud: CloudState;
  onNavigate: (view: NavKey) => void;
  onCheckout: (payload: Row) => Promise<void>;
  onPaymentProof: (payload: Row) => Promise<Row>;
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
  const [proofOpen, setProofOpen] = useState(false);
  const [proofProvider, setProofProvider] = useState("MTN MoMo");
  const [proofMonths, setProofMonths] = useState("1");
  const [proofPayerPhone, setProofPayerPhone] = useState(s(shop.owner_phone));
  const [proofPayerName, setProofPayerName] = useState(s(shop.owner_name) || s(shop.owner_username));
  const [proofNote, setProofNote] = useState("");
  const [proofBusy, setProofBusy] = useState(false);
  const [proofError, setProofError] = useState("");
  const [proofNotice, setProofNotice] = useState("");
  const [proofResult, setProofResult] = useState<Row | null>(null);
  const [proofRequestId, setProofRequestId] = useState(() => "DESKTOP-" + crypto.randomUUID().toUpperCase());
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
  async function submitPaymentProof(event: React.FormEvent) {
    event.preventDefault();
    setProofBusy(true); setProofError(""); setProofNotice("");
    try {
      const result = await onPaymentProof({
        requestId: proofRequestId,
        provider: proofProvider,
        payerPhone: proofPayerPhone,
        payerName: proofPayerName,
        months: n(proofMonths),
        paymentNote: proofNote.trim()
      });
      setProofResult(result);
      setProofNotice(result.reused
        ? "Your previous payment request was recovered safely. No duplicate claim was created."
        : "Your payment claim is saved and awaiting independent BeBoss administrator verification.");
    } catch (error) {
      setProofError(errorText(error));
    } finally {
      setProofBusy(false);
    }
  }

  function closePaymentProof() {
    if (proofBusy) return;
    setProofOpen(false);
    setProofResult(null);
    setProofError("");
    setProofNotice("");
    setProofNote("");
    setProofRequestId("DESKTOP-" + crypto.randomUUID().toUpperCase());
  }

  async function copyUssdCode() {
    const code = s(proofResult?.ussdCode);
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setProofNotice("USSD instruction copied. Complete the transfer on your phone; the desktop app does not initiate a payment.");
    } catch {
      setProofError("Clipboard access is unavailable. Select and copy the USSD instruction manually.");
    }
  }

  async function openSupportWhatsApp() {
    const digits = s(proofResult?.supportWhatsapp).replace(/\D/g, "");
    const waNumber = digits.length === 9 ? "250" + digits : digits.startsWith("0") ? "25" + digits : digits;
    if (!waNumber) return;
    const message = `Hello BeBoss Support. I submitted payment claim ${s(proofResult?.paymentRequestId)} for ${s(shop.shop_name)}. Please review the pending verification.`;
    await window.beBossDesktop.openExternal("https://wa.me/" + waNumber + "?text=" + encodeURIComponent(message));
  }

  return <div className="page-stack"><PageHeading title="Subscription & payments" description="Review the active shop plan, payment claims and issued activation records." action={<><button className="btn-outline" onClick={() => onNavigate("devices")}><Smartphone size={16} /> Manage devices</button><button className="btn-outline" onClick={() => { setProofResult(null); setProofError(""); setProofNotice(""); setProofOpen(true); }}><Wallet size={16} /> Mobile Money claim</button><button className="btn-primary" onClick={() => setRenewOpen(true)}><CreditCard size={16} /> Renew or upgrade</button></>} />
    <section className="plan-card"><div><span className="eyebrow">CURRENT SHOP PLAN</span><h2>{s(shop.subscription_status) || "UNAVAILABLE"}</h2><p>{s(shop.shop_name)} · {s(shop.business_type) || "Retail"}</p></div><div className="plan-expiry"><span>Subscription expiry</span><strong>{dateTime(shop.subscription_expires_at)}</strong><StatusPill value={expired ? "EXPIRED" : s(shop.subscription_status) || "TRIAL"} /></div><div className="plan-summary"><span>Monthly plan price</span><strong>{money(shop.monthly_fee_rwf)}</strong><small>{n(shop.branch_count)} branches · {n(shop.worker_count)} staff · {n(shop.device_count)} devices</small></div></section>
    <div className="two-col"><section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">PAYMENT CLAIMS</span><h3>Recent claims</h3></div></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Provider</th><th>Amount</th><th>Duration</th><th>Status</th></tr></thead><tbody>{payments.map((p) => <tr key={s(p.id)}><td>{dateOnly(p.created_at)}</td><td>{s(p.provider)}</td><td>{money(p.amount_rwf)}</td><td>{n(p.duration_months)} months</td><td><StatusPill value={s(p.status)} /></td></tr>)}</tbody></table></div>{!payments.length && <Empty title="No payment claims" description="Payment claims submitted for this shop will appear here." />}</section>
    <section className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow muted">ACTIVATION CODES</span><h3>Issued codes</h3></div></div><div className="table-wrap"><table><thead><tr><th>Plan</th><th>Days</th><th>Status</th><th>Issued</th></tr></thead><tbody>{codes.map((c) => <tr key={s(c.unlock_code)}><td>{s(c.tier_code)}</td><td>{n(c.plan_days)}</td><td><StatusPill value={s(c.status)} /></td><td>{dateOnly(c.issued_at)}</td></tr>)}</tbody></table></div>{!codes.length && <Empty title="No activation codes" description="Verified payment claims and unlock codes are recorded here." />}</section></div>
    <section className="panel announcements"><div className="panel-heading"><div><span className="eyebrow muted">BEBOSS NOTICES</span><h3>Shop announcements</h3></div><Bell size={18} className="muted-icon" /></div>{rows(cloud.announcements).length ? rows(cloud.announcements).map((a) => <div className="announcement-row" key={s(a.id)}><StatusPill value={s(a.severity)} /><div><strong>{s(a.title)}</strong><p>{s(a.body)}</p></div></div>) : <Empty title="No active announcements" description="Important service updates for shop owners appear here." icon={Bell} />}</section>
    {proofOpen && <Modal title={proofResult ? "Mobile Money payment instructions" : "Submit a Mobile Money claim"} onClose={closePaymentProof}>
      {proofResult ? <div className="form-grid">
        <div className="field-wide checkout-plan-summary">
          <div><span>Claim status</span><strong><StatusPill value={s(proofResult.status) || "PENDING_VERIFICATION"} /></strong></div>
          <div><span>Payment request</span><strong>{s(proofResult.paymentRequestId)}</strong></div>
          <div><span>Amount to transfer</span><strong className="checkout-total">{money(proofResult.amountRwf)}</strong></div>
          <div><span>Merchant / recipient</span><strong>{s(proofResult.recipientName) || "Configured BeBoss merchant"}</strong></div>
        </div>
        <label className="field-wide">USSD instruction<input readOnly value={s(proofResult.ussdCode)} /></label>
        <div className="info-note field-wide"><ShieldCheck size={16} /> This claim remains pending until a BeBoss administrator independently verifies the merchant payment. A USSD screen, SMS text or browser return does not automatically activate the subscription. Never share your Mobile Money PIN or one-time password.</div>
        {proofError && <div className="inline-alert error field-wide"><AlertTriangle size={15} />{proofError}</div>}
        {proofNotice && <div className="inline-alert info field-wide"><Activity size={15} />{proofNotice}</div>}
        <div className="modal-actions field-wide">
          <button type="button" className="btn-outline" onClick={() => void copyUssdCode()}><Clipboard size={15} /> Copy USSD instruction</button>
          {s(proofResult.supportWhatsapp) && <button type="button" className="btn-outline" onClick={() => void openSupportWhatsApp()}><MessageCircle size={15} /> Contact support</button>}
          <button type="button" className="btn-primary" onClick={closePaymentProof}><CheckCircle2 size={15} /> Done</button>
        </div>
      </div> : <form className="form-grid" onSubmit={(event) => void submitPaymentProof(event)}>
        <div className="field-wide checkout-plan-summary">
          <div><span>Registered shop usage</span><strong>{n(shop.branch_count)} branches · {n(shop.worker_count)} staff · {n(shop.device_count)} devices</strong></div>
          <div><span>Request protection</span><strong>Owner verified · idempotent · rate limited</strong></div>
        </div>
        <label className="field-wide">Mobile Money provider<select value={proofProvider} onChange={(event) => setProofProvider(event.target.value)}><option value="MTN MoMo">MTN MoMo</option><option value="Airtel Money">Airtel Money</option></select></label>
        <label>Subscription duration<select value={proofMonths} onChange={(event) => setProofMonths(event.target.value)}>{[1, 3, 6, 12].map((value) => <option key={value} value={String(value)}>{value} month{value === 1 ? "" : "s"}{value === 3 ? " · 10% discount" : value === 12 ? " · 20% discount" : ""}</option>)}</select></label>
        <label>Payer mobile number<input required value={proofPayerPhone} onChange={(event) => setProofPayerPhone(event.target.value)} placeholder="+250 7XX XXX XXX" /></label>
        <label className="field-wide">Payer full name<input required minLength={2} maxLength={120} value={proofPayerName} onChange={(event) => setProofPayerName(event.target.value)} /></label>
        <label className="field-wide">Payment note or confirmation SMS text (optional)<textarea maxLength={1000} rows={3} value={proofNote} onChange={(event) => setProofNote(event.target.value)} placeholder="Add a note or paste the official confirmation SMS after paying. Do not include a PIN or OTP." /></label>
        <div className="info-note field-wide"><ShieldCheck size={16} /> BeBoss calculates the amount from the registered shop plan and trusted server pricing. The claim is stored as PENDING_VERIFICATION; it does not grant access or mark a payment as settled.</div>
        {proofError && <div className="inline-alert error field-wide"><AlertTriangle size={15} />{proofError}</div>}
        <div className="modal-actions field-wide"><button type="button" className="btn-outline" disabled={proofBusy} onClick={closePaymentProof}>Cancel</button><button className="btn-primary" disabled={proofBusy || proofPayerName.trim().length < 2 || proofPayerPhone.trim().length < 9}>{proofBusy ? <LoaderCircle size={16} className="spin" /> : <Wallet size={16} />}Create payment claim</button></div>
      </form>}
    </Modal>}
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