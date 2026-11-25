import { useEffect, useState } from "react";
import { Check, ClipboardCopy, LoaderCircle, Printer, Share2, X } from "lucide-react";
import { toDataURL } from "qrcode";
import { dateTime, n, s } from "../lib/format";
import type { Row } from "../lib/types";

type PaymentReceipt = { payment: Row; customer: Row; profile: Row };

export function CustomerPaymentReceiptPreview({ receipt, onClose }: { receipt: PaymentReceipt; onClose: () => void }) {
  const { payment, customer, profile } = receipt;
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const shop = s(profile.shopName || profile.shop_name || "BeBoss");
  const currency = s(profile.currencySymbol || profile.currency_symbol || "FRw");
  const amount = n(payment.amount);
  const formatMoney = (value: unknown) => currency + " " + Math.round(n(value)).toLocaleString("en-US");
  const previous = n(payment.previousDebt);
  const remaining = n(payment.remainingDebt);

  useEffect(() => {
    let cancelled = false;
    const payload = [
      "BEBOSS", "CUSTOMER_PAYMENT", s(payment.id), s(payment.receiptNumber),
      s(customer.id), String(Math.round(amount * 100)), String(Math.round(remaining * 100)),
      String(n(payment.paymentDate))
    ].join("|");
    toDataURL(payload, {
      width: 184, margin: 1, errorCorrectionLevel: "Q",
      color: { dark: "#101b2c", light: "#ffffff" }
    }).then((value) => { if (!cancelled) setQr(value); })
      .catch(() => { if (!cancelled) setNotice("QR generation is unavailable on this device."); });
    return () => { cancelled = true; };
  }, [payment, customer, amount, remaining]);

  async function createShareFile() {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1560;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This device cannot create a receipt image.");
    const gradient = ctx.createLinearGradient(0, 0, 1200, 1560);
    gradient.addColorStop(0, "#fffaf5");
    gradient.addColorStop(1, "#eef3fa");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 1560);
    ctx.fillStyle = "#0e1a2d";
    ctx.fillRect(0, 0, 1200, 285);
    ctx.fillStyle = "#f47b3c";
    ctx.fillRect(0, 278, 1200, 8);
    const logo = new Image();
    logo.src = "/beboss-app-logo.png";
    await new Promise<void>((resolve) => {
      logo.onload = () => resolve();
      logo.onerror = () => resolve();
    });
    if (logo.complete && logo.naturalWidth > 0) ctx.drawImage(logo, 70, 55, 110, 110);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 54px Arial";
    ctx.fillText(shop.slice(0, 28), logo.complete && logo.naturalWidth > 0 ? 215 : 80, 105);
    ctx.fillStyle = "#cbd7e8";
    ctx.font = "bold 24px Arial";
    ctx.fillText("CUSTOMER PAYMENT RECEIPT", 80, 158);
    ctx.font = "24px Arial";
    ctx.fillText(s(profile.phone), 80, 208);
    ctx.fillStyle = "#263b56";
    ctx.font = "bold 27px Arial";
    ctx.fillText("PAYMENT RECEIVED", 80, 370);
    ctx.fillStyle = "#e66b34";
    ctx.font = "bold 72px Arial";
    ctx.fillText(formatMoney(amount), 80, 475);
    ctx.fillStyle = "#526984";
    ctx.font = "28px Arial";
    const lines = [
      ["Customer", s(customer.name)],
      ["Receipt", s(payment.receiptNumber)],
      ["Date", dateTime(payment.paymentDate)],
      ["Payment method", s(payment.paymentMethod)],
      ["Previous balance", formatMoney(previous)],
      ["Remaining balance", formatMoney(remaining)]
    ];
    let y = 600;
    for (const [label, value] of lines) {
      ctx.fillStyle = "#7789a1"; ctx.font = "22px Arial"; ctx.fillText(label.toUpperCase(), 80, y);
      ctx.fillStyle = "#203650"; ctx.font = "bold 29px Arial"; ctx.fillText(value.slice(0, 48), 80, y + 42);
      y += 124;
    }
    const qrPayload = [
      "BEBOSS", "CUSTOMER_PAYMENT", s(payment.id), s(payment.receiptNumber),
      s(customer.id), String(Math.round(amount * 100)), String(Math.round(remaining * 100)),
      String(n(payment.paymentDate))
    ].join("|");
    const qrValue = qr || await toDataURL(qrPayload, {
      width: 184, margin: 1, errorCorrectionLevel: "Q",
      color: { dark: "#101b2c", light: "#ffffff" }
    });
    const image = new Image();
    image.src = qrValue;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The receipt QR could not be loaded."));
      });
    ctx.fillStyle = "#ffffff"; ctx.fillRect(840, 1130, 250, 250);
    ctx.drawImage(image, 865, 1155, 200, 200);
    ctx.fillStyle = "#63768f"; ctx.font = "20px Arial";
    ctx.fillText("Keep this receipt for your records. Confirm balances with the shop.", 80, 1430);
    ctx.fillText("Powered by BeBoss", 80, 1480);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not export the receipt image.")), "image/png"));
    return new File([blob], "beboss-payment-" + (s(payment.receiptNumber) || "receipt") + ".png", { type: "image/png" });
  }

  async function share() {
    setBusy(true); setNotice("");
    try {
      const file = await createShareFile();
      const shareData = { title: "BeBoss customer payment receipt", text: "Payment receipt " + s(payment.receiptNumber), files: [file] };
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share(shareData);
        setNotice("Receipt shared.");
      } else {
        const url = URL.createObjectURL(file);
        const anchor = document.createElement("a");
        anchor.href = url; anchor.download = file.name; anchor.click();
        URL.revokeObjectURL(url);
        setNotice("Receipt image downloaded. Attach it to WhatsApp, email or your preferred app.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setNotice("Sharing was cancelled.");
      else setNotice(error instanceof Error ? error.message : "Could not share this receipt.");
    } finally { setBusy(false); }
  }

  async function copyReference() {
    try {
      await navigator.clipboard.writeText(s(payment.receiptNumber));
      setCopied(true); setNotice("Receipt reference copied.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setNotice("Clipboard access is unavailable. Select the receipt reference to copy it."); }
  }

  return <div className="modal-backdrop receipt-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card receipt-modal-card customer-payment-modal" role="dialog" aria-modal="true" aria-label="Customer payment receipt">
      <div className="modal-head">
        <div><span className="eyebrow muted">PAYMENT CONFIRMATION</span><h3>Receipt {s(payment.receiptNumber)}</h3></div>
        <button className="icon-btn" onClick={onClose} aria-label="Close receipt"><X size={18}/></button>
      </div>
      <div className="receipt-toolbar customer-payment-toolbar">
        <span>Saved payment record · {s(payment.paymentMethod)}</span>
        <div>
          <button className="btn-outline" onClick={() => void copyReference()}>{copied ? <Check size={15}/> : <ClipboardCopy size={15}/>} {copied ? "Copied" : "Copy reference"}</button>
          <button className="btn-outline" disabled={busy} onClick={() => void share()}>{busy ? <LoaderCircle className="spin" size={15}/> : <Share2 size={15}/>} {busy ? "Preparing…" : "Share receipt"}</button>
          <button className="btn-outline" onClick={() => window.print()}><Printer size={15}/> Print / PDF</button>
        </div>
      </div>
      {notice && <div className="inline-alert">{notice}</div>}
      <article className="customer-payment-paper receipt-print-area customer-payment-print-area">
        <header className="customer-payment-brand">
          <img src="/beboss-app-logo.png" alt="BeBoss logo"/>
          <div><strong>{shop}</strong><span>CUSTOMER PAYMENT RECEIPT</span></div>
        </header>
        <div className="customer-payment-amount">
          <span>PAYMENT RECEIVED</span>
          <strong>{formatMoney(amount)}</strong>
          <small>Thank you for your payment.</small>
        </div>
        <div className="customer-payment-details">
          <div><span>Customer</span><strong>{s(customer.name)}</strong></div>
          {s(customer.phone) && <div><span>Phone</span><strong>{s(customer.phone)}</strong></div>}
          <div><span>Receipt reference</span><strong>{s(payment.receiptNumber)}</strong></div>
          <div><span>Date and time</span><strong>{dateTime(payment.paymentDate)}</strong></div>
          <div><span>Payment method</span><strong>{s(payment.paymentMethod)}</strong></div>
          <div><span>Received by</span><strong>{s(payment.recordedBy) || "Shop operator"}</strong></div>
          {s(payment.notes) && <div className="field-wide"><span>Reference / notes</span><strong>{s(payment.notes)}</strong></div>}
        </div>
        <div className="customer-payment-balance">
          <div><span>Previous outstanding balance</span><strong>{formatMoney(previous)}</strong></div>
          <div><span>Payment received</span><strong>− {formatMoney(amount)}</strong></div>
          <div className="remaining"><span>Remaining customer balance</span><strong>{formatMoney(remaining)}</strong></div>
        </div>
        <footer className="customer-payment-footer">
          {qr && <img src={qr} alt="QR containing the customer payment receipt reference" />}
          <div><strong>Keep this receipt for your records.</strong><span>The QR contains receipt details for quick reference; it is not proof of bank or mobile-money settlement.</span><small>Powered by BeBoss</small></div>
        </footer>
      </article>
    </section>
  </div>;
}
