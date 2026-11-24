import type React from "react";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, ShieldCheck, Store } from "lucide-react";
import { errorText, n, s } from "../../lib/format";
import type { CommitSnapshot, Snapshot } from "../../lib/types";
import { PageHeading, StatusPill } from "../ui";

export function SettingsPage({ snapshot, onCommit, offline }: {
  snapshot: Snapshot | null; onCommit: CommitSnapshot; offline: boolean
}) {
  const profile = snapshot?.shopProfile ?? {};
  const build = () => ({
    shopName: s(profile.shopName), ownerName: s(profile.name), phone: s(profile.phone), email: s(profile.email),
    address: s(profile.address), tin: s(profile.tinNumber), taxRate: String(profile.taxRate ?? 0),
    receiptHeader: s(profile.receiptHeader), receiptFooter: s(profile.receiptFooter), currency: s(profile.currencySymbol) || "FRw",
    dailyTarget: String(profile.dailySalesTarget ?? 0), monthlyTarget: String(profile.monthlyRevenueTarget ?? 0)
  });
  const [draft, setDraft] = useState(build);
  useEffect(() => { setDraft(build()); }, [snapshot?.shopProfile?.updatedAt]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    await onCommit((next) => {
      const now = Date.now();
      next.shopProfile = { ...next.shopProfile, shopName: draft.shopName.trim(), name: draft.ownerName.trim(), phone: draft.phone.trim(), email: draft.email.trim(), address: draft.address.trim(), tinNumber: draft.tin.trim(), taxRate: Math.max(0, Math.min(100, n(draft.taxRate))), receiptHeader: draft.receiptHeader.trim(), receiptFooter: draft.receiptFooter.trim(), currencySymbol: draft.currency.trim() || "FRw", dailySalesTarget: n(draft.dailyTarget), monthlyRevenueTarget: n(draft.monthlyTarget), updatedAt: now, hlcTimestamp: 0, lastModifiedDeviceId: "DESKTOP" };
    });
  }
  return <div className="page-stack"><PageHeading title="Shop settings" description="Configure business identity, receipt details, tax presentation and sales targets." />
    <div className="settings-layout"><form className="panel settings-form" onSubmit={(e) => save(e).catch((x) => alert(errorText(x)))}><div className="panel-heading"><div><span className="eyebrow muted">BUSINESS PROFILE</span><h3>Shop identity</h3></div><Store size={18} className="muted-icon" /></div>
      <div className="form-grid"><label className="field-wide">Shop name<input required value={draft.shopName} onChange={(e) => setDraft({ ...draft, shopName: e.target.value })} /></label><label>Owner name<input value={draft.ownerName} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} /></label><label>Business phone<input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label><label>Email<input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label><label>Tax identification number<input value={draft.tin} onChange={(e) => setDraft({ ...draft, tin: e.target.value })} /></label><label className="field-wide">Shop address<input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label><label>Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={draft.taxRate} onChange={(e) => setDraft({ ...draft, taxRate: e.target.value })} /></label><label>Currency symbol<input value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} /></label><label>Daily sales target (FRw)<input type="number" min="0" value={draft.dailyTarget} onChange={(e) => setDraft({ ...draft, dailyTarget: e.target.value })} /></label><label>Monthly revenue target (FRw)<input type="number" min="0" value={draft.monthlyTarget} onChange={(e) => setDraft({ ...draft, monthlyTarget: e.target.value })} /></label></div>
      <div className="panel-subhead"><strong>Receipt content</strong><small>These fields are synchronized with the shop profile.</small></div><div className="form-grid"><label className="field-wide">Receipt header<input value={draft.receiptHeader} onChange={(e) => setDraft({ ...draft, receiptHeader: e.target.value })} /></label><label className="field-wide">Receipt footer<input value={draft.receiptFooter} onChange={(e) => setDraft({ ...draft, receiptFooter: e.target.value })} /></label></div>
      <div className="form-footer"><span className="muted small-text">Owner-only configuration change</span><button className="btn-primary"><Check size={16} /> Save settings</button></div>
    </form><aside className="panel settings-side"><div className="panel-heading"><div><span className="eyebrow muted">WORKSPACE SECURITY</span><h3>Connected account</h3></div><ShieldCheck size={18} className="green-icon" /></div><div className="security-line"><span>Signed in as</span><strong>@{s(profile.ownerUsername) || "shop owner"}</strong></div><div className="security-line"><span>Owner verification</span><StatusPill value="ACTIVE" /></div><div className="security-line"><span>Snapshot integrity</span><StatusPill value={snapshot ? "VERIFIED" : "NOT SYNCED"} /></div><div className="security-line"><span>Local session storage</span><strong>OS encrypted</strong></div><div className="security-line"><span>Data writes</span><strong>Owner verified cloud API</strong></div><div className="security-warning"><AlertTriangle size={16} /><span>Subscription, unlock-code and platform-admin controls cannot be changed from shop profile settings.</span></div></aside></div>
  </div>;
}