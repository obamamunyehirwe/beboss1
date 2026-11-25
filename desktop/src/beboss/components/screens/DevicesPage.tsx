import type React from "react";
import { useState } from "react";
import { Clock3, Copy, CreditCard, Monitor, Plus, ShieldCheck, Smartphone } from "lucide-react";
import { activeStaff, dateTime, errorText, money, n, rows, s } from "../../lib/format";
import type { CloudAction, CloudState, Row } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard, StatusPill } from "../ui";

export function DevicesPage({ cloud, onAction, offline }: { cloud: CloudState; onAction: CloudAction; offline: boolean }) {
  const [open, setOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [userId, setUserId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [invite, setInvite] = useState<Row | null>(null);
  const devices = rows(cloud.devices);
  const staff = activeStaff(cloud).filter((u) => u.role !== "OWNER");
  const branches = rows(cloud.branches).filter((b) => b.is_active);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const result = await onAction("device_create", { deviceName, assignedUserId: userId, branchId });
    setOpen(false); setDeviceName(""); setUserId(""); setBranchId("");
    setInvite(result);
  }
  return <div className="page-stack"><PageHeading title="POS terminal fleet" description="Register and pair additional BeBoss devices with named staff and branch assignments." action={<button className="btn-primary" disabled={offline} onClick={() => setOpen(true)}><Plus size={17} /> Invite terminal</button>} />
    <div className="stat-grid three"><StatCard label="Registered devices" value={String(devices.length)} icon={Smartphone} /><StatCard label="Active terminals" value={String(devices.filter((d) => d.is_active).length)} icon={Monitor} tone="green" /><StatCard label="Monthly add-on" value={money(Math.max(0, devices.filter((d) => d.is_active && !d.is_owner_primary).length * 2000))} icon={CreditCard} tone="purple" /></div>
    <div className="device-grid">{devices.map((d) => <article className="device-card" key={s(d.id)}><div className="device-top"><span className="device-icon"><Smartphone size={21} /></span><StatusPill value={d.is_active ? "ACTIVE" : "REVOKED"} /></div><h3>{s(d.device_name) || "Paired terminal"}</h3><p>{s(d.assigned_user_name) || "Unassigned staff"} · {s(d.role)}</p><div className="device-detail"><span>Branch</span><strong>{s(d.branch_name) || "Main branch"}</strong></div><div className="device-detail"><span>Last sync</span><strong>{n(d.last_synced_at) ? dateTime(d.last_synced_at) : "Not yet paired"}</strong></div><div className="device-card-foot"><span>{d.is_owner_primary ? "Owner terminal" : "FRw 2,000 / month"}</span><span className="mono">{s(d.device_id).slice(0, 18) || "Pending invite"}</span></div></article>)}</div>
    {!devices.length && <Empty title="No paired devices" description="Open the owner Android device online and sync its device registry before inviting a terminal." icon={Smartphone} />}
    {open && <Modal title="Invite a POS terminal" onClose={() => setOpen(false)}><form className="form-grid" onSubmit={(e) => create(e).catch((x) => alert(errorText(x)))}><label className="field-wide">Device name<input required value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Front counter PC" /></label><label className="field-wide">Assigned staff<select required value={userId} onChange={(e) => { const u = staff.find((x) => s(x.user_id) === e.target.value); setUserId(e.target.value); if (u) setBranchId(s(u.assigned_branch_id)); }}><option value="">Select staff</option>{staff.map((u) => <option key={s(u.user_id)} value={s(u.user_id)}>{s(u.full_name)} · {s(u.role)}</option>)}</select></label><label className="field-wide">Branch<select required value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Select branch</option>{branches.map((b) => <option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><div className="info-note field-wide"><ShieldCheck size={16} /> The invite is single-use and expires after one hour. The additional terminal adds FRw 2,000 per month.</div><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary"><Smartphone size={16} /> Create invite</button></div></form></Modal>}
    {invite && <Modal title="Secure device invitation" onClose={() => setInvite(null)}><div className="invite-code"><span>ONE-TIME PAIRING CODE</span><strong>{s(invite.joinCode)}</strong><button className="btn-outline" onClick={() => navigator.clipboard.writeText(s(invite.joinCode))}><Copy size={15} /> Copy code</button></div><div className="inline-alert info"><Clock3 size={16} /> This invitation expires {dateTime(invite.expiresAt)}. Enter it on the new BeBoss Android terminal to complete pairing.</div></Modal>}
  </div>;
}