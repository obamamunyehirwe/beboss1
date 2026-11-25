import type React from "react";
import { useEffect, useState } from "react";
import { LoaderCircle, Printer, Share2, ShieldCheck, X } from "lucide-react";
import { toDataURL } from "qrcode";
import { dateTime, n, rows, s } from "../lib/format";
import type { ReceiptPayload } from "../lib/types";
import { buildShareCardData, renderShareCard, triggerDownload } from "../lib/share-card";

export function ReceiptPreview({ receipt, onClose }: { receipt: ReceiptPayload; onClose: () => void }) {
  const [seal, setSeal] = useState("");
  const [sealError, setSealError] = useState("");
  const [qr, setQr] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const profile = receipt.profile ?? {};
  const sale = receipt.sale ?? {};
  const items = rows(receipt.items);
  const shopName = s(profile.shopName || profile.shop_name || "BeBoss");
  const currency = s(profile.currencySymbol || profile.currency_symbol || "FRw");
  const total = n(sale.totalAmount);
  const paid = sale.amountPaid == null && ["PAID", "COMPLETED"].includes(s(sale.paymentStatus).toUpperCase()) ? total : n(sale.amountPaid);
  const balance = Math.max(0, total - paid);
  const discount = n(sale.discountAmount);
  const subtotal = items.reduce((sum, item) => sum + (n(item.subtotal) || n(item.unitPriceAtSale) * n(item.quantitySold)), 0);
  const taxRate = n(profile.taxRate);
  const taxIncluded = taxRate > 0 ? Math.round(total * taxRate / (100 + taxRate) * 100) / 100 : 0;
  const format = (value: unknown) => currency + " " + n(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  useEffect(() => {
    let cancelled = false;
    setSeal("");
    setSealError("");
    const cents = (value: unknown) => String(Math.round(n(value) * 100));
    const payload = [
      s(sale.id), s(sale.receiptNumber), cents(sale.totalAmount), cents(sale.amountPaid),
      s(sale.saleDate), s(sale.branchId), s(sale.cashierId), s(profile.tinNumber).trim()
    ].join("|");
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)).then((digest) => {
      const hex = Array.from(new Uint8Array(digest).slice(0, 5)).map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
      if (!cancelled) setSeal("BB-" + hex);
    }).catch(() => { if (!cancelled) setSealError("The receipt seal could not be calculated on this device."); });
    return () => { cancelled = true; };
  }, [receipt, sale, profile]);

  useEffect(() => {
    let cancelled = false;
    setQr("");
    const cents = (value: unknown) => String(Math.round(n(value) * 100));
    const payload = ["BEBOSS", shopName, s(sale.receiptNumber), cents(total), s(seal)].join("|");
    toDataURL(payload, { margin: 1, width: 168, errorCorrectionLevel: "M", color: { dark: "#0d1728", light: "#ffffff" } })
      .then((url) => { if (!cancelled) setQr(url); })
      .catch(() => { /* QR is optional; receipt still prints without it */ });
    return () => { cancelled = true; };
  }, [receipt, sale, profile, seal, shopName, total]);

  async function handleShare() {
    setShareBusy(true); setShareError("");
    try {
      const blob = await renderShareCard(buildShareCardData(receipt, seal));
      const filename = "beboss-receipt-" + (s(sale.receiptNumber) || "card").replace(/[^\w.-]/g, "_") + ".png";
      const file = new File([blob], filename, { type: blob.type || "image/png" });
      if (typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "BeBoss sales receipt", text: "Receipt " + s(sale.receiptNumber), files: [file] });
      } else {
        triggerDownload(blob, filename);
        setShareError("The system share sheet is not available here. The receipt image was downloaded so you can attach it to WhatsApp, email or another app.");
      }
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Could not create the share card on this device.");
    } finally { setShareBusy(false); }
  }

  return <div className="modal-backdrop receipt-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card receipt-modal-card" role="dialog" aria-modal="true" aria-label="Receipt preview">
      <div className="modal-head"><div><span className="eyebrow muted">COMPLETED TRANSACTION</span><h3>Receipt {s(sale.receiptNumber)}</h3></div><button className="icon-btn" onClick={onClose} aria-label="Close receipt"><X size={18} /></button></div>
      <div className="receipt-toolbar"><span><ShieldCheck size={15} /> Receipt details from the saved shop transaction</span><div><button className="btn-outline" disabled={shareBusy} onClick={handleShare}>{shareBusy ? <LoaderCircle className="spin" size={15} /> : <Share2 size={15} />}{shareBusy ? "Creating…" : "Share card"}</button><button className="btn-outline" onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</button><button className="btn-primary" onClick={onClose}>Done</button></div></div>
      {shareError && <div className="inline-alert error"><Share2 size={14} />{shareError}</div>}
      <article className="receipt-paper receipt-print-area">
        <header className="receipt-brand"><img src="/beboss-app-logo.png" alt="BeBoss logo" /><div><strong>{shopName}</strong><span>SALES RECEIPT</span></div></header>
        {s(profile.receiptHeader).trim() && <p className="receipt-custom-line">{s(profile.receiptHeader)}</p>}
        <div className="receipt-shop-details">
          {s(profile.address).trim() && <span>{s(profile.address)}</span>}
          {s(profile.phone).trim() && <span>Tel: {s(profile.phone)}</span>}
          {s(profile.email).trim() && <span>{s(profile.email)}</span>}
          {s(profile.tinNumber).trim() && <span>TIN: {s(profile.tinNumber)}</span>}
        </div>
        <div className="receipt-rule" />
        <div className="receipt-identity">
          <div><span>Receipt number</span><strong>{s(sale.receiptNumber) || s(sale.id)}</strong></div>
          <div><span>Date and time</span><strong>{dateTime(sale.saleDate)}</strong></div>
          <div><span>Customer</span><strong>{s(sale.customerName) || "Walk-in Customer"}</strong></div>
          <div><span>Cashier</span><strong>{s(sale.cashierName) || "—"}</strong></div>
          <div><span>Payment</span><strong>{s(sale.paymentMethod) || "—"} · {s(sale.paymentStatus) || "PAID"}</strong></div>
          {rows(sale.tenders).length > 0 && <div className="receipt-tenders"><span>Split tender</span><strong>{rows(sale.tenders).map((t) => s(t.method) + " " + format(t.amount)).join(" + ")}</strong></div>}
        </div>
        <div className="receipt-rule" />
        <table className="receipt-items-table"><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr></thead><tbody>
          {items.map((item, index) => {
            const quantity = n(item.quantitySold);
            const unitPrice = n(item.unitPriceAtSale);
            const lineTotal = n(item.subtotal) || unitPrice * quantity;
            return <tr key={s(item.id) || index}><td>{s(item.productName) || "Item"}</td><td>{quantity.toLocaleString()}</td><td>{format(unitPrice)}</td><td>{format(lineTotal)}</td></tr>;
          })}
          {!items.length && <tr><td colSpan={4} className="receipt-no-items">Item details are not available in this saved snapshot.</td></tr>}
        </tbody></table>
        <div className="receipt-rule" />
        <div className="receipt-totals">
          <div><span>Subtotal</span><strong>{format(subtotal || total + discount)}</strong></div>
          {discount > 0 && <div><span>Discount</span><strong>− {format(discount)}</strong></div>}
          <div className="receipt-grand-total"><span>Total</span><strong>{format(total)}</strong></div>
          {profile.showTaxOnReceipt !== false && taxRate > 0 && <div><span>Incl. Tax ({taxRate}%)</span><strong>{format(taxIncluded)}</strong></div>}
          <div><span>Paid</span><strong>{format(paid)}</strong></div>
          {balance > 0 && <div className="receipt-balance"><span>Balance due</span><strong>{format(balance)}</strong></div>}
        </div>
        <div className="receipt-rule" />
        <footer className="receipt-footer">
          {s(profile.receiptFooter).trim() && <strong>{s(profile.receiptFooter)}</strong>}
          {qr && <img className="receipt-qr" src={qr} alt="QR code containing receipt details and checksum" width="112" height="112" />}
          <span>Receipt checksum (offline comparison only): {seal || (sealError ? "Unavailable" : "Generating…")}</span>
          {sealError && <small>{sealError}</small>}
          <span>Powered by BeBoss</span>
        </footer>
      </article>
      <p className="receipt-modal-note">For a paper copy choose your printer. Choose “Save as PDF” in the system print dialog to keep a digital copy.</p>
    </section>
  </div>;
}