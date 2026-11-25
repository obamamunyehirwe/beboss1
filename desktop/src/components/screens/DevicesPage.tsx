import type React from "react";
import { useMemo, useState } from "react";
import { Activity, Clock3, Copy, CreditCard, Edit3, Laptop, LoaderCircle, Monitor, Pause, Play, Plus, RefreshCw, Search, ShieldCheck, Smartphone, Store, Trash2, UserRound, Wifi, WifiOff } from "lucide-react";
import { activeStaff, dateTime, errorText, money, n, rows, s } from "../../lib/format";
import type { CloudAction, CloudState, Row } from "../../lib/types";
import { Empty, Modal, PageHeading, StatCard, StatusPill } from "../ui";

type DeviceFilter = "ALL" | "ACTIVE" | "PENDING" | "PAUSED";

export function DevicesPage({ cloud, onAction, onRefresh, offline, currentDeviceId = "" }: {
  cloud: CloudState; onAction: CloudAction; onRefresh: () => Promise<void> | void;
  offline: boolean; currentDeviceId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [userId, setUserId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [invite, setInvite] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [editName, setEditName] = useState("");
  const [editUserId, setEditUserId] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DeviceFilter>("ALL");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");

  const devices = rows(cloud.devices);
  const staff = activeStaff(cloud).filter((user) => s(user.role).toUpperCase() !== "OWNER");
  const branches = rows(cloud.branches).filter((branch) => branch.is_active !== false);
  const activeDevices = devices.filter((device) => device.is_active === true);
  const additionalActive = activeDevices.filter((device) => device.is_owner_primary !== true).length;
  const monthlyAddon = additionalActive * 2000;
  const pendingCount = activeDevices.filter((device) => !s(device.device_id)).length;
  const pairedCount = activeDevices.length - pendingCount;

  const filtered = useMemo(() => devices.filter((device) => {
    const isActive = device.is_active === true;
    const pending = isActive && !s(device.device_id);
    const paired = isActive && !!s(device.device_id);
    const stateMatch = filter === "ALL" ||
      (filter === "ACTIVE" && paired) ||
      (filter === "PENDING" && pending) ||
      (filter === "PAUSED" && !isActive);
    const haystack = [device.device_name, device.assigned_user_name, device.assigned_username, device.role, device.branch_name, device.device_id]
      .map((value) => s(value).toLowerCase()).join(" ");
    return stateMatch && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [devices, filter, query]);

  function openEdit(device: Row) {
    setPageError("");
    setEditing(device);
    setEditName(s(device.device_name));
    setEditUserId(s(device.assigned_user_id));
    setEditBranchId(s(device.branch_id));
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); setPageError("");
    try {
      const result = await onAction("device_create", { deviceName: deviceName.trim(), assignedUserId: userId, branchId });
      setOpen(false); setDeviceName(""); setUserId(""); setBranchId("");
      setInvite(result);
    } catch (error) {
      setPageError(errorText(error));
    } finally { setSaving(false); }
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true); setPageError("");
    try {
      const result = await onAction("device_update", {
        id: s(editing.id), deviceName: editName.trim(), assignedUserId: editUserId, branchId: editBranchId
      });
      setEditing(null);
      if (s(result.joinCode)) setInvite(result);
    } catch (error) {
      setPageError(errorText(error));
    } finally { setSaving(false); }
  }

  async function runAction(action: string, payload: Row): Promise<Row | null> {
    setPageError("");
    try { return await onAction(action, payload); }
    catch (error) { setPageError(errorText(error)); return null; }
  }

  async function copyCode() {
    const code = s(invite?.joinCode);
    if (!code) return;
    try { await navigator.clipboard.writeText(code); }
    catch { setPageError("Clipboard access is unavailable. Select the invitation code and copy it manually."); }
  }

  async function refresh() {
    setRefreshing(true); setPageError("");
    try { await onRefresh(); }
    catch (error) { setPageError(errorText(error)); }
    finally { setRefreshing(false); }
  }

  function syncState(device: Row) {
    if (!device.is_active) return { label: "PAUSED", detail: "This terminal is blocked from connecting", online: false };
    if (!s(device.device_id)) return { label: "INVITATION PENDING", detail: "Waiting for the one-time pairing code to be redeemed", online: false };
    const last = n(device.last_synced_at);
    if (!last) return { label: "AWAITING FIRST SYNC", detail: "Paired terminal has not reported a successful sync yet", online: false };
    const online = Date.now() - last <= 15 * 60_000;
    return { label: online ? "RECENTLY SYNCED" : "STALE CONNECTION", detail: "Last sync " + dateTime(last), online };
  }

  return <div className="page-stack enterprise-device-page">
    <PageHeading eyebrow="FLEET · SECURITY · LICENSED ACCESS" title="Device management"
      description="Register additional Android and desktop terminals, assign operators and branches, rotate unused invitations, and control access to the shared shop account."
      action={<div className="enterprise-page-actions">
        <button className="btn-outline" disabled={offline || refreshing} onClick={() => void refresh()}><Activity size={15} className={refreshing ? "spin" : ""} /> Refresh cloud</button>
        <button className="btn-primary" disabled={offline || !staff.length || !branches.length} onClick={() => setOpen(true)}><Plus size={17} /> Add device</button>
      </div>} />

    <div className="stat-grid four">
      <StatCard label="Registered terminals" value={devices.length.toLocaleString()} sub="All device records in this shop" icon={Laptop} />
      <StatCard label="Paired active devices" value={pairedCount.toLocaleString()} sub="Approved terminal identities" icon={Monitor} tone="green" />
      <StatCard label="Awaiting pairing" value={pendingCount.toLocaleString()} sub="Active one-time invitations" icon={Clock3} tone="orange" />
      <StatCard label="Monthly device add-on" value={money(monthlyAddon)} sub={additionalActive + " additional active devices × FRw 2,000"} icon={CreditCard} tone="purple" />
    </div>

    <section className="enterprise-device-policy">
      <span className="enterprise-device-policy-icon"><ShieldCheck size={19} /></span>
      <div><strong>One owner terminal included · FRw 2,000 per additional active device / month</strong><p>Each added terminal is linked to one active shop operator and branch. The server recalculates licensed usage and the subscription amount; pausing a terminal removes it from active device usage after the cloud confirms the change.</p></div>
      <div className="enterprise-device-policy-total"><span>Shop licensed device count</span><strong>{n(cloud.shop.device_count || activeDevices.length)} active</strong><small>Current monthly shop plan: {money(cloud.shop.monthly_fee_rwf)}</small></div>
    </section>

    <section className="enterprise-device-toolbar panel">
      <div className="enterprise-toolbar-copy"><span className="eyebrow muted">DEVICE DIRECTORY</span><h3>All registered terminals</h3><p>Connection state is derived from the terminal's last successful cloud sync.</p></div>
      <div className="enterprise-toolbar-controls">
        <label className="enterprise-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search device, user, role or branch" /></label>
        <select aria-label="Filter device registry" value={filter} onChange={(event) => setFilter(event.target.value as DeviceFilter)}>
          <option value="ALL">All devices</option><option value="ACTIVE">Paired / active</option>
          <option value="PENDING">Awaiting pairing</option><option value="PAUSED">Paused</option>
        </select>
      </div>
      <div className="enterprise-toolbar-foot"><span>Showing {filtered.length} of {devices.length} device records</span><span>Management actions require an online, verified owner device</span></div>
    </section>

    {pageError && <div className="inline-alert error">{pageError}</div>}

    <div className="enterprise-device-grid">
      {filtered.map((device) => {
        const state = syncState(device);
        const self = !!currentDeviceId && s(device.device_id) === currentDeviceId;
        const unpaired = !s(device.device_id);
        const isDesktop = s(device.device_id).startsWith("DESKTOP:");
        return <article className="enterprise-device-card" key={s(device.id)}>
          <div className="enterprise-device-card-top">
            <span className="enterprise-device-icon">{isDesktop ? <Laptop size={20} /> : <Smartphone size={20} />}</span>
            <div className="enterprise-device-top-status"><StatusPill value={device.is_active ? "ACTIVE" : "PAUSED"} /><span className={"enterprise-connection " + (state.online ? "online" : "")}><i />{state.label}</span></div>
          </div>
          <div className="enterprise-device-name"><div><h3>{s(device.device_name) || (isDesktop ? "BeBoss Desktop" : "POS terminal")}</h3><p>{s(device.assigned_user_name) || "No operator"} · {s(device.role) || "Unassigned"}</p></div>{self && <span className="enterprise-current-device">THIS DEVICE</span>}</div>
          <div className="enterprise-device-info">
            <div><span><Store size={13} /> Branch</span><strong>{s(device.branch_name) || "Not assigned"}</strong></div>
            <div><span><UserRound size={13} /> Username</span><strong>{s(device.assigned_username) ? "@" + s(device.assigned_username) : "—"}</strong></div>
            <div><span><Clock3 size={13} /> Last successful sync</span><strong>{n(device.last_synced_at) ? dateTime(device.last_synced_at) : "No sync reported"}</strong></div>
            <div><span><Activity size={13} /> Registered</span><strong>{n(device.created_at) ? dateTime(device.created_at) : "—"}</strong></div>
          </div>
          <p className="enterprise-device-state">{state.detail}</p>
          <div className="enterprise-device-id"><span>Terminal identity</span><code>{s(device.device_id) || "Not paired — invitation slot"}</code></div>
          <div className="enterprise-device-card-foot"><span>{device.is_owner_primary ? "Included owner terminal" : "FRw 2,000 / month while active"}</span><span>{unpaired ? "Pairing required" : isDesktop ? "Desktop installation" : "Android installation"}</span></div>
          {!device.is_owner_primary && <div className="enterprise-device-actions">
            <button className="btn-outline small" disabled={offline || !device.is_active} onClick={() => openEdit(device)}><Edit3 size={14} /> Edit</button>
            <button className="btn-outline small" disabled={offline || self} onClick={() => void runAction("device_set_active", { id: s(device.id), isActive: !device.is_active })}>
              {device.is_active ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
            </button>
            {unpaired && device.is_active && <button className="btn-outline small" disabled={offline} onClick={() => void runAction("device_reinvite", { id: s(device.id) }).then((result) => { if (result?.joinCode) setInvite(result); })}><RefreshCw size={14} /> Rotate code</button>}
            {!device.is_active && <button className="btn-outline small danger" disabled={offline || self} onClick={() => {
              if (confirm("Permanently remove this paused device record? The server retains its security and billing audit history.")) {
                void runAction("device_remove", { id: s(device.id) });
              }
            }}><Trash2 size={14} /> Remove</button>}
          </div>}
          {self && <p className="enterprise-device-self-note">This is the desktop currently managing the shop. Another owner terminal is required to pause or remove it.</p>}
        </article>;
      })}
    </div>

    {!filtered.length && <Empty title={devices.length ? "No devices match these filters" : "No additional devices registered"} description={devices.length ? "Change your search or status filter to see the rest of the terminal fleet." : "Add a terminal to create a secure one-time pairing invitation for an existing shop operator."} icon={Smartphone} />}

    {open && <Modal title="Register an additional POS device" onClose={() => !saving && setOpen(false)}>
      <form className="form-grid" onSubmit={(event) => void create(event)}>
        <label className="field-wide">Device label<input required minLength={2} maxLength={120} value={deviceName} onChange={(event) => setDeviceName(event.target.value)} placeholder="Front counter PC or Store 2 tablet" /></label>
        <label className="field-wide">Assigned active staff member<select required value={userId} onChange={(event) => {
          const user = staff.find((item) => s(item.user_id) === event.target.value);
          setUserId(event.target.value);
          if (user?.assigned_branch_id) setBranchId(s(user.assigned_branch_id));
        }}><option value="">Select an operator</option>{staff.map((user) => <option key={s(user.user_id)} value={s(user.user_id)}>{s(user.full_name)} · {s(user.role)} · {s(user.assigned_branch_name)}</option>)}</select></label>
        <label className="field-wide">Assigned branch<select required value={branchId} onChange={(event) => {
          const nextBranchId = event.target.value;
          setBranchId(nextBranchId);
          if (!staff.some((user) => s(user.user_id) === userId && s(user.assigned_branch_id) === nextBranchId)) setUserId("");
        }}><option value="">Select a branch</option>{branches.map((branch) => <option key={s(branch.id)} value={s(branch.id)}>{s(branch.name)}</option>)}</select></label>
        <div className="info-note field-wide"><ShieldCheck size={16} /> BeBoss creates a protected device slot and a single-use invitation that expires after one hour. The server applies the FRw 2,000 monthly add-on and validates that the operator belongs to the selected branch.</div>
        {pageError && <div className="inline-alert error field-wide">{pageError}</div>}
        <div className="modal-actions field-wide"><button type="button" className="btn-outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" disabled={saving || offline || !deviceName.trim() || !userId || !branchId}>{saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}Create secure invitation</button></div>
      </form>
    </Modal>}

    {editing && <Modal title="Edit device assignment" onClose={() => !saving && setEditing(null)}>
      <form className="form-grid" onSubmit={(event) => void saveEdit(event)}>
        <label className="field-wide">Terminal name<input required minLength={2} maxLength={120} value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
        {s(editing.role).toUpperCase() !== "OWNER" && !s(editing.device_id) && <>
          <label className="field-wide">Assigned active operator<select required value={editUserId} onChange={(event) => {
            const user = staff.find((item) => s(item.user_id) === event.target.value);
            setEditUserId(event.target.value);
            if (user?.assigned_branch_id) setEditBranchId(s(user.assigned_branch_id));
          }}><option value="">Select operator</option>{staff.map((user) => <option key={s(user.user_id)} value={s(user.user_id)}>{s(user.full_name)} · {s(user.role)}</option>)}</select></label>
        </>}
        <label className="field-wide">Assigned branch<select required value={editBranchId} disabled={!!s(editing.device_id) && !s(editing.device_id).startsWith("DESKTOP:")} onChange={(event) => {
          setEditBranchId(event.target.value);
          const matching = staff.find((user) => s(user.assigned_branch_id) === event.target.value);
          if (matching && s(editing.role).toUpperCase() !== "OWNER") setEditUserId(s(matching.user_id));
        }}><option value="">Select branch</option>{branches.map((branch) => <option key={s(branch.id)} value={s(branch.id)}>{s(branch.name)}</option>)}</select></label>
        {!!s(editing.device_id) && !s(editing.device_id).startsWith("DESKTOP:") && <div className="info-note field-wide"><ShieldCheck size={15} /> A paired Android terminal cannot be moved to a different operator or branch from this screen. Revoke it and issue a new invitation to transfer its assignment. The device label can still be changed.</div>}
        {pageError && <div className="inline-alert error field-wide">{pageError}</div>}
        <div className="modal-actions field-wide"><button type="button" className="btn-outline" disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button className="btn-primary" disabled={saving || offline || !editName.trim() || !editBranchId}>{saving ? "Saving..." : <><ShieldCheck size={15} /> Save device</>}</button></div>
      </form>
    </Modal>}

    {invite && <Modal title="Secure device invitation" onClose={() => setInvite(null)}>
      <div className="enterprise-invite-panel">
        <span>ONE-TIME PAIRING CODE</span><strong>{s(invite.joinCode)}</strong>
        <p>Share this code with the operator of the new BeBoss installation. It can be redeemed once and expires at the time shown.</p>
        <button className="btn-outline" onClick={() => void copyCode()}><Copy size={15} /> Copy pairing code</button>
      </div>
      <div className="inline-alert info"><Clock3 size={16} /> Invitation expiry: {dateTime(invite.expiresAt)}. On the new Android device, choose “Join existing shop” and enter the code.</div>
    </Modal>}
  </div>;
}