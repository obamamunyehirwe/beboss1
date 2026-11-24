export type SnapshotRow = Record<string, unknown>;
export type SnapshotDataset = {
  metadata: SnapshotRow;
  shopProfile: SnapshotRow;
  products: SnapshotRow[];
  customers: SnapshotRow[];
  sales: SnapshotRow[];
  saleItems: SnapshotRow[];
  customerPayments: SnapshotRow[];
  purchases: SnapshotRow[];
  stockTransfers: SnapshotRow[];
  branches: SnapshotRow[];
  users: SnapshotRow[];
  tombstones: SnapshotRow[];
};

const COLLECTIONS = [
  "products", "customers", "sales", "saleItems", "customerPayments",
  "purchases", "stockTransfers", "branches", "users",
] as const;
const MAX_CHUNK_RECORDS = 250;
const MAX_TOKEN_BYTES = 5 * 1024 * 1024;

function asRows(value: unknown): SnapshotRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is SnapshotRow => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}
function stringValue(value: unknown): string { return value == null ? "" : String(value); }
function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function chunks<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const output: T[][] = [];
  for (let i = 0; i < items.length; i += size) output.push(items.slice(i, i + size));
  return output;
}
function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}
async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))).slice(0, 16);
}
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + step, bytes.length)));
  }
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) result[i] = binary.charCodeAt(i);
  return result;
}

export async function encodeDesktopShareToken(payload: SnapshotRow, secret: string): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  if (raw.byteLength > MAX_TOKEN_BYTES) throw new Error("A desktop snapshot chunk exceeds the 5 MB uncompressed safety limit.");
  const compressed = new Uint8Array(await new Response(
    new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer());
  const base64 = toBase64(compressed);
  return "BBSHARE1:" + await hmac(base64, secret) + ":" + base64;
}

export async function decodeDesktopShareToken(token: string, secret: string): Promise<SnapshotRow> {
  if (token.length > MAX_TOKEN_BYTES * 2) throw new Error("Snapshot token exceeds the permitted size.");
  const prefix = "BBSHARE1:";
  if (!token.startsWith(prefix)) throw new Error("Unrecognized BeBoss snapshot token.");
  const remainder = token.slice(prefix.length);
  const separator = remainder.indexOf(":");
  if (separator < 0) throw new Error("Malformed BeBoss snapshot token.");
  const signature = remainder.slice(0, separator).toUpperCase();
  const base64 = remainder.slice(separator + 1);
  if (!/^[A-F0-9]{16}$/.test(signature) || !base64) throw new Error("Malformed snapshot signature.");
  const expected = await hmac(base64, secret);
  const a = new TextEncoder().encode(signature);
  const b = new TextEncoder().encode(expected);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) mismatch |= a[i]! ^ b[i]!;
  if (mismatch !== 0) throw new Error("Snapshot integrity verification failed.");
  const compressed = fromBase64(base64);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const raw = await new Response(stream).arrayBuffer();
  if (raw.byteLength > MAX_TOKEN_BYTES) throw new Error("Decompressed snapshot exceeds the 5 MB safety limit.");
  // JSON.parse rounds Android's packed 64-bit HLC values because they exceed
  // JavaScript's safe integer range. Quote only these known fields before parsing;
  // Android JSONObject.optLong accepts the decimal-string representation.
  const rawJson = new TextDecoder().decode(raw).replace(
    /("hlcTimestamp"\s*:\s*)(-?\d{16,})/g,
    (_match, prefix: string, value: string) => prefix + '"' + value + '"',
  );
  const parsed = JSON.parse(rawJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Snapshot payload is not an object.");
  return parsed as SnapshotRow;
}

export function createDesktopSnapshotChunks(
  source: SnapshotDataset,
  now: number,
  desktopId: string,
  exportedBy: string,
): SnapshotRow[] {
  const collections = {
    products: asRows(source.products),
    customers: asRows(source.customers),
    sales: asRows(source.sales),
    customerPayments: asRows(source.customerPayments),
    purchases: asRows(source.purchases),
    stockTransfers: asRows(source.stockTransfers),
    branches: asRows(source.branches),
    users: asRows(source.users),
    tombstones: asRows(source.tombstones),
  };
  const collectionChunks = Object.fromEntries(
    Object.entries(collections).map(([key, value]) => [key, chunks(value, MAX_CHUNK_RECORDS)]),
  ) as Record<keyof typeof collections, SnapshotRow[][]>;
  const count = Math.max(1, ...Object.values(collectionChunks).map((value) => value.length));
  const generation = crypto.randomUUID();
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const total = Object.values(collections).reduce((sum, value) => sum + value.length, 0);

  return Array.from({ length: count }, (_, index) => {
    const salePart = collectionChunks.sales[index] ?? [];
    const saleIds = new Set(salePart.map((sale) => stringValue(sale.id)));
    const metadata = {
      ...(source.metadata ?? {}),
      app: "BeBoss",
      version: "3.0",
      schemaVersion: 3,
      format: "beboss_branch_datashare_v3",
      timestamp: now,
      issuedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      nonce: nonce + "-" + index,
      sinceUpdatedAt: 0,
      exportedBy,
      exportedByRole: "OWNER",
      desktopDeviceId: desktopId,
    };
    return {
      metadata,
      shopProfile: source.shopProfile,
      products: collectionChunks.products[index] ?? [],
      customers: collectionChunks.customers[index] ?? [],
      sales: salePart,
      saleItems: asRows(source.saleItems).filter((item) => saleIds.has(stringValue(item.saleId))),
      customerPayments: collectionChunks.customerPayments[index] ?? [],
      purchases: collectionChunks.purchases[index] ?? [],
      stockTransfers: collectionChunks.stockTransfers[index] ?? [],
      branches: collectionChunks.branches[index] ?? [],
      users: collectionChunks.users[index] ?? [],
      tombstones: collectionChunks.tombstones[index] ?? [],
      _desktopMeta: { syncGeneration: generation, chunkIndex: index, chunkCount: count, totalRecords: total },
    } as SnapshotRow;
  });
}

export function completeSnapshotRows(rows: SnapshotRow[]): SnapshotRow[][] {
  const byDevice = new Map<string, SnapshotRow[]>();
  for (const row of rows) {
    const id = stringValue(row.device_id);
    const base = id.replace(/#c\\d+$/, "");
    const current = byDevice.get(base) ?? [];
    current.push(row);
    byDevice.set(base, current);
  }

  const complete: SnapshotRow[][] = [];
  for (const deviceRows of byDevice.values()) {
    const generations = new Map<string, SnapshotRow[]>();
    for (const row of deviceRows) {
      const generation = stringValue(row.sync_generation);
      const group = generations.get(generation) ?? [];
      group.push(row);
      generations.set(generation, group);
    }
    const candidates = [...generations.values()].sort(
      (a, b) => Math.max(...b.map((r) => numberValue(r.updated_at))) - Math.max(...a.map((r) => numberValue(r.updated_at))),
    );
    const valid = candidates.find((group) => {
      if (!group.length) return false;
      const generation = stringValue(group[0]!.sync_generation);
      const count = numberValue(group[0]!.chunk_count);
      const indexFor = (row: SnapshotRow) => {
        const suffix = /#c(\\d+)$/.exec(stringValue(row.device_id));
        return suffix ? Number(suffix[1]) : numberValue(row.chunk_index);
      };
      const indexes = group.map(indexFor).sort((a, b) => a - b);
      if (!generation) {
        const summaryCount = /(\\d+) chunk\\(s\\)/i.exec(stringValue(group[0]!.records_summary));
        const expected = count > 0 ? count : Number(summaryCount?.[1] || 1);
        return indexes.length === expected && indexes.every((value, index) => value === index);
      }
      const expected = count || 1;
      return group.every((row) => stringValue(row.sync_generation) === generation && numberValue(row.chunk_count) === expected) &&
        indexes.length === expected && indexes.every((value, index) => value === index);
    });
    if (valid) {
      complete.push(valid.slice().sort((a, b) => {
        const getIndex = (row: SnapshotRow) => {
          const suffix = /#c(\\d+)$/.exec(stringValue(row.device_id));
          return suffix ? Number(suffix[1]) : numberValue(row.chunk_index);
        };
        return getIndex(a) - getIndex(b);
      }));
    }
  }
  return complete;
}

function longValue(value: unknown): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return BigInt(value.trim());
  } catch {
    // Invalid or out-of-range client values are treated as absent.
  }
  return 0n;
}

/** Match Android HlcClock.compareVersions for stable cross-platform LWW ordering. */
export function compareSnapshotVersions(local: SnapshotRow, remote: SnapshotRow): number {
  const localHlc = longValue(local.hlcTimestamp);
  const remoteHlc = longValue(remote.hlcTimestamp);
  const localVersion = numberValue(local.syncVersion);
  const remoteVersion = numberValue(remote.syncVersion);
  const localUpdated = numberValue(local.updatedAt);
  const remoteUpdated = numberValue(remote.updatedAt);

  if (localHlc > 0n && remoteHlc > 0n && localHlc !== remoteHlc) {
    return remoteHlc > localHlc ? 1 : -1;
  }
  if (remoteVersion !== localVersion && (localHlc === 0n || remoteHlc === 0n)) {
    if (remoteUpdated >= localUpdated || remoteVersion > localVersion + 1) {
      return remoteVersion > localVersion ? 1 : -1;
    }
  }
  if (remoteUpdated !== localUpdated) return remoteUpdated > localUpdated ? 1 : -1;
  if (remoteVersion !== localVersion) return remoteVersion > localVersion ? 1 : -1;
  return stringValue(remote.lastModifiedDeviceId).localeCompare(stringValue(local.lastModifiedDeviceId));
}

export function mergeDesktopSnapshotParts(parts: SnapshotRow[]): SnapshotDataset {
  const maps = Object.fromEntries(COLLECTIONS.map((key) => [key, new Map<string, SnapshotRow>()])) as Record<
    (typeof COLLECTIONS)[number], Map<string, SnapshotRow>
  >;
  const tombstones = new Map<string, SnapshotRow>();
  let profile: SnapshotRow = {};
  let metadata: SnapshotRow = {};
  let latestProfileTime = -1;

  for (const part of parts) {
    const partMetadata = (part.metadata && typeof part.metadata === "object" ? part.metadata : {}) as SnapshotRow;
    const partTime = numberValue(partMetadata.timestamp);
    if (partTime >= latestProfileTime) {
      latestProfileTime = partTime;
      profile = (part.shopProfile && typeof part.shopProfile === "object" ? part.shopProfile : {}) as SnapshotRow;
      metadata = partMetadata;
    }
    for (const key of COLLECTIONS) {
      for (const row of asRows(part[key])) {
        const id = stringValue(row.id);
        if (!id) continue;
        const previous = maps[key].get(id);
        if (!previous || compareSnapshotVersions(previous, row) >= 0) maps[key].set(id, row);
      }
    }
    for (const row of asRows(part.tombstones)) {
      const id = stringValue(row.recordId);
      const current = tombstones.get(id);
      if (id && (!current || numberValue(row.deletedAt) >= numberValue(current.deletedAt))) tombstones.set(id, row);
    }
  }

  const allTombstones = [...tombstones.values()];
  const deletedIds = new Set(allTombstones.map((row) => stringValue(row.recordId)));
  const live = (key: (typeof COLLECTIONS)[number]) => [...maps[key].values()].filter((row) =>
    row.isDeleted !== true && !deletedIds.has(stringValue(row.id))
  );

  return {
    metadata,
    shopProfile: profile,
    products: live("products"),
    customers: live("customers"),
    sales: live("sales"),
    saleItems: live("saleItems"),
    customerPayments: live("customerPayments"),
    purchases: live("purchases"),
    stockTransfers: live("stockTransfers"),
    branches: live("branches"),
    users: live("users"),
    tombstones: allTombstones,
  };
}
