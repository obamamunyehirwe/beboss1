type Row = Record<string, any>;

const MUTABLE_TABLES = ["products", "customers", "sales", "branches", "users", "stockTransfers"] as const;
const IMMUTABLE_TABLES = ["saleItems", "customerPayments", "purchases"] as const;

const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value: unknown) => value == null ? "" : String(value);
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((row) => row && typeof row === "object" && !Array.isArray(row)) : [];

function compareVersions(local: Row, remote: Row): number {
  const localHlc = number(local.hlcTimestamp);
  const remoteHlc = number(remote.hlcTimestamp);
  const localUpdatedAt = number(local.updatedAt ?? local.saleDate ?? local.paymentDate ?? local.purchaseDate ?? local.timestamp);
  const remoteUpdatedAt = number(remote.updatedAt ?? remote.saleDate ?? remote.paymentDate ?? remote.purchaseDate ?? remote.timestamp);
  const localVersion = number(local.syncVersion);
  const remoteVersion = number(remote.syncVersion);

  if (localHlc > 0 && remoteHlc > 0 && localHlc !== remoteHlc) return remoteHlc > localHlc ? 1 : -1;
  if (remoteVersion !== localVersion && (localHlc === 0 || remoteHlc === 0)) {
    if (remoteUpdatedAt >= localUpdatedAt || remoteVersion > localVersion + 1) {
      return remoteVersion > localVersion ? 1 : -1;
    }
  }
  if (remoteUpdatedAt !== localUpdatedAt) return remoteUpdatedAt > localUpdatedAt ? 1 : -1;
  if (remoteVersion !== localVersion) return remoteVersion > localVersion ? 1 : -1;
  return text(remote.lastModifiedDeviceId).localeCompare(text(local.lastModifiedDeviceId));
}

function tombstoneVersion(row: Row) {
  return number(row.hlcTimestamp) || number(row.deletedAt);
}

function isDeletedByTombstone(table: string, row: Row, tombstones: Map<string, Row>) {
  if (row.isDeleted === true) return true;
  const tombstoneTable = table === "stockTransfers" ? "stock_transfers" : table;
  const tombstone = tombstones.get(tombstoneTable + ":" + text(row.id));
  if (!tombstone) return false;
  const rowHlc = number(row.hlcTimestamp);
  const tombstoneHlc = number(tombstone.hlcTimestamp);
  if (rowHlc > 0 && tombstoneHlc > 0) return tombstoneHlc >= rowHlc;
  return number(tombstone.deletedAt) >= number(row.updatedAt ?? row.saleDate ?? row.purchaseDate);
}

export function mergeSnapshots(remote: Row, local: Row): { snapshot: Row; conflictsResolved: number } {
  let conflictsResolved = 0;
  const snapshot: Row = {
    ...remote,
    metadata: {
      ...(number(local.metadata?.timestamp) > number(remote.metadata?.timestamp) ? local.metadata : remote.metadata),
      schemaVersion: Math.max(number(remote.metadata?.schemaVersion), number(local.metadata?.schemaVersion), 3),
      timestamp: Math.max(number(remote.metadata?.timestamp), number(local.metadata?.timestamp))
    },
    shopProfile: { ...remote.shopProfile },
    tombstones: []
  };

  const tombstoneMap = new Map<string, Row>();
  for (const tombstone of [...rows(remote.tombstones), ...rows(local.tombstones)]) {
    const key = text(tombstone.tableName) + ":" + text(tombstone.recordId);
    if (key === ":") continue;
    const previous = tombstoneMap.get(key);
    if (!previous || tombstoneVersion(tombstone) >= tombstoneVersion(previous)) tombstoneMap.set(key, tombstone);
  }
  snapshot.tombstones = [...tombstoneMap.values()];

  for (const table of MUTABLE_TABLES) {
    const map = new Map<string, Row>();
    for (const row of rows(remote[table])) if (text(row.id)) map.set(text(row.id), row);
    for (const row of rows(local[table])) {
      const key = text(row.id);
      if (!key) continue;
      const previous = map.get(key);
      if (!previous) map.set(key, row);
      else if (compareVersions(previous, row) > 0) {
        map.set(key, table === "users" ? {
          ...row,
          pinHash: text(row.pinHash) || previous.pinHash,
          password: text(row.password) || previous.password
        } : row);
        conflictsResolved++;
      } else if (table === "users") {
        map.set(key, {
          ...previous,
          pinHash: text(previous.pinHash) || row.pinHash,
          password: text(previous.password) || row.password
        });
      }
    }
    snapshot[table] = [...map.values()].filter((row) => !isDeletedByTombstone(table, row, tombstoneMap));
  }

  for (const table of IMMUTABLE_TABLES) {
    const map = new Map<string, Row>();
    for (const row of [...rows(remote[table]), ...rows(local[table])]) {
      const key = text(row.id);
      if (key && !map.has(key)) map.set(key, row);
    }
    snapshot[table] = [...map.values()];
  }

  // Sale line items are immutable, but their parent sale can be deleted on
  // another device. A sale tombstone must remove the orphaned lines as well.
  const liveSaleIds = new Set(rows(snapshot.sales).map((sale) => text(sale.id)));
  snapshot.saleItems = rows(snapshot.saleItems).filter((item) => liveSaleIds.has(text(item.saleId)));

  const localProfile = local.shopProfile && typeof local.shopProfile === "object" ? local.shopProfile : {};
  const remoteProfile = remote.shopProfile && typeof remote.shopProfile === "object" ? remote.shopProfile : {};
  const profileWinner = compareVersions(remoteProfile, localProfile) > 0 ? localProfile : remoteProfile;
  if (profileWinner !== remoteProfile) conflictsResolved++;
  const paymentWinner = number(localProfile.lastPaymentDate) > number(remoteProfile.lastPaymentDate) ? localProfile : remoteProfile;
  const subscriptionExpiresAt = Math.max(number(localProfile.subscriptionExpiresAt), number(remoteProfile.subscriptionExpiresAt));
  snapshot.shopProfile = {
    ...profileWinner,
    subscriptionExpiresAt,
    subscriptionStatus: subscriptionExpiresAt > Date.now() ? "ACTIVE" : profileWinner.subscriptionStatus,
    lastPaymentDate: Math.max(number(localProfile.lastPaymentDate), number(remoteProfile.lastPaymentDate)),
    lastPaymentRef: paymentWinner.lastPaymentRef ?? "",
    lastPaymentAmount: paymentWinner.lastPaymentAmount ?? 0,
    syncVersion: Math.max(number(localProfile.syncVersion), number(remoteProfile.syncVersion)),
    hlcTimestamp: Math.max(number(localProfile.hlcTimestamp), number(remoteProfile.hlcTimestamp))
  };

  return { snapshot, conflictsResolved };
}
