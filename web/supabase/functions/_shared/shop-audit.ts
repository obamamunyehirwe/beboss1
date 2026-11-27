export type ShopAuditEntity = "BRANCH" | "STOCK_TRANSFER";
export type AuditSnapshot = Record<string, string | number | boolean | null>;

const stringValue = (value: unknown, limit = 80) =>
  typeof value === "string" ? value.trim().slice(0, limit) : value == null ? "" : String(value).slice(0, limit);
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const boolValue = (value: unknown) => value === true || value === "true" || value === 1;

export function buildShopAuditSnapshot(entity: ShopAuditEntity, row: Record<string, unknown>): AuditSnapshot {
  if (entity === "BRANCH") {
    return {
      recordId: stringValue(row.id, 80),
      name: stringValue(row.name, 72),
      code: stringValue(row.code, 24),
      address: stringValue(row.address, 72),
      phone: stringValue(row.phone, 24),
      email: stringValue(row.email, 64),
      notes: stringValue(row.notes, 160),
      managerUserId: stringValue(row.manager_user_id, 64),
      managerName: stringValue(row.manager_name, 48),
      isActive: boolValue(row.is_active),
      isMainBranch: boolValue(row.is_main_branch),
      operationalStatus: stringValue(row.operational_status, 20),
      dailyTargetRwf: numberValue(row.daily_sales_target_rwf),
      monthlyTargetRwf: numberValue(row.monthly_target_rwf),
      openingCashFloatRwf: numberValue(row.opening_cash_float),
      createdAt: numberValue(row.created_at),
      updatedAt: numberValue(row.updated_at),
      hlcTimestamp: numberValue(row.hlc_timestamp),
      lastModifiedDeviceId: stringValue(row.last_modified_device_id, 80)
    };
  }
  return {
    recordId: stringValue(row.id, 80),
    transferNumber: stringValue(row.transfer_number, 32),
    productId: stringValue(row.product_id, 80),
    productName: stringValue(row.product_name, 64),
    fromBranchId: stringValue(row.from_branch_id, 80),
    fromBranchName: stringValue(row.from_branch_name, 48),
    toBranchId: stringValue(row.to_branch_id, 80),
    toBranchName: stringValue(row.to_branch_name, 48),
    quantity: numberValue(row.quantity),
    unit: stringValue(row.unit, 16),
    costValueRwf: numberValue(row.cost_value_rwf),
    status: stringValue(row.status, 24).toUpperCase(),
    transferredBy: stringValue(row.transferred_by, 48),
    receivedBy: stringValue(row.received_by, 48),
    receivedAt: numberValue(row.received_at),
    notes: stringValue(row.notes, 160),
    createdAt: numberValue(row.created_at),
    updatedAt: numberValue(row.updated_at),
    hlcTimestamp: numberValue(row.hlc_timestamp),
    lastModifiedDeviceId: stringValue(row.last_modified_device_id, 80)
  };
}

export function parseShopAuditSnapshot(detail: unknown, recordId: string): AuditSnapshot | null {
  if (typeof detail !== "string" || detail.length > 1_000) return null;
  try {
    const parsed = JSON.parse(detail);
    if (parsed?.version !== 1 || parsed?.recordId !== recordId ||
        !parsed.state || typeof parsed.state !== "object" || Array.isArray(parsed.state)) return null;
    return parsed.state as AuditSnapshot;
  } catch {
    return null;
  }
}

const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");

export function classifyShopAuditTransition(
  entity: ShopAuditEntity,
  previous: AuditSnapshot | null,
  current: AuditSnapshot
): { action: string; detail: string } | null {
  const recordId = stringValue(current.recordId, 80);
  if (!recordId) return null;
  const changes: string[] = [];

  if (!previous) {
    const created = numberValue(current.createdAt) > 0 &&
      numberValue(current.createdAt) === numberValue(current.updatedAt);
    const action = entity === "BRANCH"
      ? (!boolValue(current.isActive) ? "DEACTIVATED" : created ? "CREATED" : "STATE_OBSERVED")
      : (created ? "CREATED" : "STATE_OBSERVED");
    changes.push("Initial synchronized state");
    return { action, detail: JSON.stringify({ version: 1, recordId, state: current, changes }) };
  }

  if (entity === "BRANCH") {
    if (!same(previous.isActive, current.isActive)) changes.push(boolValue(current.isActive) ? "reactivated" : "deactivated");
    if (!same(previous.operationalStatus, current.operationalStatus)) changes.push("operating status changed");
    if (!same(previous.managerUserId, current.managerUserId) || !same(previous.managerName, current.managerName)) changes.push("branch manager changed");
    if (!same(previous.isMainBranch, current.isMainBranch)) changes.push(boolValue(current.isMainBranch) ? "main branch designation set" : "main branch designation removed");
    const profileKeys = ["name","code","address","phone","email","notes","dailyTargetRwf","monthlyTargetRwf","openingCashFloatRwf"];
    if (profileKeys.some((key) => !same(previous[key], current[key]))) changes.push("branch profile updated");
    if (!changes.length) return null;
    const action = !same(previous.isActive, current.isActive)
      ? (boolValue(current.isActive) ? "REACTIVATED" : "DEACTIVATED")
      : !same(previous.operationalStatus, current.operationalStatus) ? "OPERATING_STATUS_CHANGED"
      : !same(previous.managerUserId, current.managerUserId) || !same(previous.managerName, current.managerName) ? "MANAGER_CHANGED"
      : !same(previous.isMainBranch, current.isMainBranch) ? "MAIN_BRANCH_CHANGED" : "PROFILE_UPDATED";
    return { action, detail: JSON.stringify({ version: 1, recordId, state: current, changes }) };
  }

  if (!same(previous.status, current.status)) changes.push("status " + stringValue(previous.status, 24) + " → " + stringValue(current.status, 24));
  if (!same(previous.quantity, current.quantity)) changes.push("quantity changed");
  if (!same(previous.fromBranchId, current.fromBranchId) || !same(previous.toBranchId, current.toBranchId)) changes.push("route changed");
  if (!same(previous.receivedBy, current.receivedBy) || !same(previous.receivedAt, current.receivedAt)) changes.push("receipt confirmation changed");
  if (!same(previous.notes, current.notes)) changes.push("notes changed");
  if (!changes.length) return null;
  const action = !same(previous.status, current.status) ? "STATUS_CHANGED" : "DETAILS_UPDATED";
  return { action, detail: JSON.stringify({ version: 1, recordId, state: current, changes }) };
}
