import type React from "react";
import { useState } from "react";
import { Check, ShieldCheck, Users } from "lucide-react";
import { errorText, rows, s } from "../../lib/format";
import type { CloudAction, CloudState, Row } from "../../lib/types";
import { Empty, Modal, PageHeading, StatusPill } from "../ui";

export function StaffPage({ cloud, onAction, offline }: { cloud: CloudState; onAction: CloudAction; offline: boolean }) {
  const [editing, setEditing] = useState<Row | null>(null);
  const [role, setRole] = useState("CASHIER");
  const [branchId, setBranchId] = useState("");
  const [active, setActive] = useState(true);
  const staff = rows(cloud.staff);
  const branches = rows(cloud.branches).filter((b) => b.is_active);
  function open(user: Row) { setEditing(user); setRole(s(user.role) || "CASHIER"); setBranchId(s(user.assigned_branch_id)); setActive(user.is_active !== false); }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    await onAction("staff_update", { userId: s(editing?.user_id), role, branchId, isActive: active });
    setEditing(null);
  }
  return <div className="page-stack"><PageHeading title="Staff & access control" description="Manage enrolled staff roles, branch assignments and activation. PIN/password enrollment remains on the owner's secure mobile terminal." />
    <div className="info-note"><ShieldCheck size={17} /><span>Desktop permissions are applied to the cloud staff mirror. Owner credentials, PIN hashes and passwords are never displayed or downloaded by this application.</span></div>
    <div className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>Staff member</th><th>Username</th><th>Role</th><th>Assigned branch</th><th>State</th><th></th></tr></thead><tbody>
      {staff.map((u) => <tr key={s(u.user_id)}><td><div className="staff-person"><span>{s(u.full_name).slice(0, 1).toUpperCase()}</span><strong>{s(u.full_name)}</strong></div></td><td className="mono">@{s(u.username)}</td><td><StatusPill value={s(u.role)} /></td><td>{s(u.assigned_branch_name) || "All branches"}</td><td><StatusPill value={u.is_active === false ? "INACTIVE" : "ACTIVE"} /></td><td><button className="btn-outline small" disabled={offline || u.role === "OWNER"} onClick={() => open(u)}>Manage access</button></td></tr>)}
    </tbody></table></div>{!staff.length && <Empty title="No staff synchronized" description="Create staff identities on the registered Android owner terminal. Existing roles and branch access can then be managed here." icon={Users} />}</div>
    {editing && <Modal title={"Manage " + s(editing.full_name)} onClose={() => setEditing(null)}><form className="form-grid" onSubmit={(e) => save(e).catch((x) => alert(errorText(x)))}><div className="field-wide staff-edit-identity"><strong>{s(editing.full_name)}</strong><small>@{s(editing.username)}</small></div><label>Role<select value={role} onChange={(e) => setRole(e.target.value)}>{["MANAGER", "CASHIER"].map((v) => <option key={v}>{v}</option>)}</select></label><label>Assigned branch<select value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">All branches</option>{branches.map((b) => <option key={s(b.id)} value={s(b.id)}>{s(b.name)}</option>)}</select></label><label className="checkbox-field field-wide"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Allow this staff account to operate</label><div className="modal-actions field-wide"><button type="button" className="btn-outline" onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary"><Check size={16} />Save access</button></div></form></Modal>}
  </div>;
}