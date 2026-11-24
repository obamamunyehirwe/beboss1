import type { ReceiptPayload } from "./types";
import { money, n, rows, s } from "./format";

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (value: HTMLImageElement | null) => resolve(value);
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = src;
    setTimeout(() => done(null), 4000);
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export type ShareCardData = {
  shopName: string;
  receiptNumber: string;
  dateLabel: string;
  itemCount: number;
  totalLabel: string;
  paidLabel: string;
  seal: string;
  cashierLabel: string;
};

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  const W = 820;
  const H = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable on this device.");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#13233c");
  bg.addColorStop(1, "#0a1220");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W - 120, 80, 20, W - 120, 80, 420);
  glow.addColorStop(0, "rgba(255,122,50,.28)");
  glow.addColorStop(1, "rgba(255,122,50,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#ff7a32";
  ctx.fillRect(0, 0, W, 8);

  const logo = await loadImage("/beboss-app-logo.png");
  ctx.save();
  roundRect(ctx, 64, 70, 104, 104, 26);
  ctx.clip();
  if (logo) {
    ctx.drawImage(logo, 64, 70, 104, 104);
  } else {
    ctx.fillStyle = "#ff7a32";
    ctx.fillRect(64, 70, 104, 104);
  }
  ctx.restore();

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f4f8ff";
  ctx.font = "800 40px Manrope, Arial, sans-serif";
  const name = data.shopName.length > 26 ? data.shopName.slice(0, 25) + "…" : data.shopName;
  ctx.fillText(name, 192, 120);

  ctx.fillStyle = "#ff9b63";
  ctx.font = "700 18px 'DM Sans', Arial, sans-serif";
  ctx.fillText("S A L E S   R E C E I P T", 194, 152);

  ctx.strokeStyle = "rgba(151,171,203,.22)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(64, 212);
  ctx.lineTo(W - 64, 212);
  ctx.stroke();

  ctx.fillStyle = "#8ba0be";
  ctx.font = "600 17px 'DM Sans', Arial, sans-serif";
  ctx.fillText("TOTAL PAID", 64, 262);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 66px Manrope, Arial, sans-serif";
  const total = data.totalLabel.length > 16 ? data.totalLabel.slice(0, 15) + "…" : data.totalLabel;
  ctx.fillText(total, 60, 334);

  const meta: [string, string][] = [
    ["Receipt", data.receiptNumber],
    ["Date", data.dateLabel],
    ["Items", String(data.itemCount)],
    ["Cashier", data.cashierLabel || "—"]
  ];
  let y = 410;
  ctx.font = "600 19px 'DM Sans', Arial, sans-serif";
  for (const [label, value] of meta) {
    ctx.fillStyle = "#8296b4";
    ctx.fillText(label, 64, y);
    ctx.fillStyle = "#e7eef9";
    ctx.textAlign = "right";
    const v = value.length > 30 ? value.slice(0, 29) + "…" : value;
    ctx.fillText(v, W - 64, y);
    ctx.textAlign = "left";
    y += 46;
  }

  if (data.paidLabel && data.paidLabel !== data.totalLabel) {
    ctx.fillStyle = "#8296b4";
    ctx.fillText("Paid", 64, y);
    ctx.fillStyle = "#6fe0b4";
    ctx.textAlign = "right";
    ctx.fillText(data.paidLabel, W - 64, y);
    ctx.textAlign = "left";
    y += 46;
  }

  roundRect(ctx, 64, y + 8, W - 128, 66, 16);
  ctx.fillStyle = "rgba(50,200,141,.1)";
  ctx.fill();
  ctx.strokeStyle = "rgba(50,200,141,.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#6fe0b4";
  ctx.font = "700 19px 'DM Sans', Arial, sans-serif";
  ctx.fillText("Verified seal  " + (data.seal || "BB-PENDING"), 86, y + 50);

  ctx.fillStyle = "#6d82a0";
  ctx.font = "600 16px 'DM Sans', Arial, sans-serif";
  ctx.fillText("Powered by BeBoss · Retail Command", 64, H - 64);

  ctx.textAlign = "right";
  ctx.fillStyle = "#ff9b63";
  ctx.font = "700 16px 'DM Sans', Arial, sans-serif";
  ctx.fillText("beboss", W - 64, H - 64);
  ctx.textAlign = "left";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render the share card.")), "image/png");
  });
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildShareCardData(receipt: ReceiptPayload, seal: string): ShareCardData {
  const profile = receipt.profile ?? {};
  const sale = receipt.sale ?? {};
  const items = rows(receipt.items);
  const total = n(sale.totalAmount);
  const paid = sale.amountPaid == null && ["PAID", "COMPLETED"].includes(s(sale.paymentStatus).toUpperCase()) ? total : n(sale.amountPaid);
  const currency = s(profile.currencySymbol || profile.currency_symbol || "FRw");
  const fmt = (value: unknown) => currency + " " + n(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return {
    shopName: s(profile.shopName || profile.shop_name || "BeBoss"),
    receiptNumber: s(sale.receiptNumber) || s(sale.id).slice(0, 8) || "—",
    dateLabel: n(sale.saleDate) ? new Date(n(sale.saleDate)).toLocaleString() : "—",
    itemCount: items.length,
    totalLabel: fmt(total),
    paidLabel: fmt(paid),
    seal,
    cashierLabel: s(sale.cashierName)
  };
}

export { money };