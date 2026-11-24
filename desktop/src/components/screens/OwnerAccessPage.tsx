import { ShieldCheck, Smartphone } from "lucide-react";
import { rows, s } from "../../lib/format";
import type { CloudState } from "../../lib/types";
import { PageHeading, StatusPill } from "../ui";

export function OwnerAccessPage({ cloud }: { cloud: CloudState }) {
  const devices = rows(cloud.devices);
  const ownerLabel = s(cloud.owner?.username || cloud.owner?.full_name || cloud.shop?.owner_username) || "Verified shop owner";
  const shopLabel = s(cloud.shop?.shop_name) || "Registered BeBoss shop";

  return <div className="page-stack">
    <PageHeading eyebrow="SECURITY & ACCESS" title="Owner access console"
      description="Review the authenticated owner session and registered POS terminals. Authorization is enforced by Supabase for every protected operation." />
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow muted">AUTHENTICATED OWNER</span><h3>Verified shop identity</h3></div><ShieldCheck size={18} className="muted-icon" /></div>
      <div className="health-row"><span className="health-dot good" /><div><strong>{ownerLabel}</strong><small>{shopLabel} · Owner identity loaded from the authenticated Supabase workspace</small></div><StatusPill value="VERIFIED SESSION" /></div>
      <p className="panel-hint">Desktop access requires a verified Supabase Auth session and active shop-owner membership. No local emergency-code bypass or client-generated subscription grant is available.</p>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow muted">REGISTERED TERMINALS</span><h3>Shop devices</h3></div><Smartphone size={18} className="muted-icon" /></div>
      {devices.length === 0
        ? <div className="empty-state compact"><span><Smartphone size={22} /></span><strong>No registered devices</strong><p>Paired BeBoss terminals appear here after their first successful cloud sync.</p></div>
        : <div className="device-list">{devices.map((device) => <div className="device-row" key={s(device.id)}>
            <span className="device-row-icon"><Smartphone size={16} /></span>
            <div><strong>{s(device.deviceName) || s(device.name) || "POS terminal"}</strong><small>{s(device.platform) || "Desktop"} · {s(device.id).slice(0, 12)}</small></div>
            <StatusPill value={device.is_active === false ? "INACTIVE" : "ACTIVE"} />
          </div>)}</div>}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow muted">SECURITY MODEL</span><h3>Protected owner operations</h3></div><ShieldCheck size={18} className="muted-icon" /></div>
      <div className="health-row"><span className="health-dot good" /><div><strong>Supabase authorization</strong><small>Owner membership, verified phone and active session are checked by the server for protected requests.</small></div></div>
      <div className="health-row"><span className="health-dot good" /><div><strong>Server-authoritative subscription</strong><small>Subscription state is sourced from the cloud billing records and cannot be extended by changing local desktop data.</small></div></div>
      <div className="health-row"><span className="health-dot good" /><div><strong>Device registry</strong><small>Terminal activation and revocation are managed through the paired-device workflows.</small></div></div>
    </section>
  </div>;
}