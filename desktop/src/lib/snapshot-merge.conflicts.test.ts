import assert from "node:assert/strict";
import test from "node:test";
import { mergeSnapshots } from "./snapshot-merge.ts";
import type { Snapshot, Row } from "./types.ts";

// Deterministic conflict-resolution test matrix for the desktop merge engine.
//
// The merge engine is Last-Write-Wins by Hybrid Logical Clock with a
// deterministic device-id tie-break. These tests pin down the behaviour that
// the offline-first guarantee depends on: concurrent edits to the same row,
// clock skew between devices, network partitions that heal, delete/edit races,
// legacy records without an HLC, and associativity of multi-way merges.

const MUTABLE = ["products", "customers", "sales", "branches", "users", "stockTransfers"] as const;
const IMMUTABLE = ["saleItems", "customerPayments", "purchases"] as const;
const ALL_TABLES = [...MUTABLE, ...IMMUTABLE] as const;

function emptySnapshot(): Snapshot {
  return {
    metadata: { schemaVersion: 3, timestamp: 0 },
    shopProfile: {},
    products: [], customers: [], sales: [], saleItems: [], customerPayments: [],
    purchases: [], stockTransfers: [], branches: [], users: [], tombstones: []
  };
}

function canon(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(canon).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canon(obj[k])).join(",") + "}";
}

// Order-independent view of the convergent part of a snapshot: the winning row
// for every id in every table, plus the surviving tombstones. shopProfile is
// excluded because its tie-break is intentionally asymmetric (subscription
// fields use max()).
function convergenceSignature(snapshot: Snapshot): string {
  const parts: string[] = [];
  for (const table of ALL_TABLES) {
    const rows = (snapshot[table] as Row[])
      .map((row) => canon(row))
      .sort();
    parts.push(table + "=" + rows.join(";"));
  }
  const tombstones = snapshot.tombstones
    .map((t) => canon({ table: t.tableName, id: t.recordId, hlc: t.hlcTimestamp ?? t.deletedAt }))
    .sort();
  parts.push("tombstones=" + tombstones.join(";"));
  return parts.join("|");
}

function rowMap(snapshot: Snapshot, table: string): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of (snapshot[table] as Row[])) map.set(String(row.id), row);
  return map;
}

test("concurrent edit to the same product row: higher HLC wins regardless of merge order", () => {
  const deviceA = emptySnapshot();
  deviceA.products = [{ id: "p-1", name: "Price A", price: 1000, hlcTimestamp: 5_000, syncVersion: 3, updatedAt: 5_000, lastModifiedDeviceId: "DEVICE:A" }];
  const deviceB = emptySnapshot();
  deviceB.products = [{ id: "p-1", name: "Price B", price: 2000, hlcTimestamp: 9_000, syncVersion: 4, updatedAt: 9_000, lastModifiedDeviceId: "DEVICE:B" }];

  const ab = mergeSnapshots(deviceA, deviceB).snapshot;
  const ba = mergeSnapshots(deviceB, deviceA).snapshot;
  assert.equal(rowMap(ab, "products").get("p-1")?.name, "Price B");
  assert.equal(rowMap(ba, "products").get("p-1")?.name, "Price B");
  assert.equal(convergenceSignature(ab), convergenceSignature(ba));
});

test("clock skew: a device whose physical clock is ahead produces a higher HLC and wins deterministically", () => {
  // Device B's wall clock is 10 minutes ahead. Its HLC is therefore larger and
  // must win, and must keep winning no matter which side is "local".
  const ahead = emptySnapshot();
  ahead.products = [{ id: "p-1", name: "Ahead", hlcTimestamp: 9_000_000, syncVersion: 1, updatedAt: 9_000_000, lastModifiedDeviceId: "DEVICE:AHEAD" }];
  const behind = emptySnapshot();
  behind.products = [{ id: "p-1", name: "Behind", hlcTimestamp: 400_000, syncVersion: 1, updatedAt: 400_000, lastModifiedDeviceId: "DEVICE:BEHIND" }];

  assert.equal(rowMap(mergeSnapshots(ahead, behind).snapshot, "products").get("p-1")?.name, "Ahead");
  assert.equal(rowMap(mergeSnapshots(behind, ahead).snapshot, "products").get("p-1")?.name, "Ahead");
});

test("network partition heal: offline edits on both sides are unioned without loss", () => {
  const offlineA = emptySnapshot();
  offlineA.products = [
    { id: "p-a", name: "Only on A", hlcTimestamp: 1_000, syncVersion: 1, updatedAt: 1_000, lastModifiedDeviceId: "A" },
    { id: "p-shared", name: "A version", hlcTimestamp: 2_000, syncVersion: 1, updatedAt: 2_000, lastModifiedDeviceId: "A" }
  ];
  const offlineB = emptySnapshot();
  offlineB.products = [
    { id: "p-b", name: "Only on B", hlcTimestamp: 1_000, syncVersion: 1, updatedAt: 1_000, lastModifiedDeviceId: "B" },
    { id: "p-shared", name: "B version", hlcTimestamp: 3_000, syncVersion: 1, updatedAt: 3_000, lastModifiedDeviceId: "B" }
  ];
  offlineB.sales = [{ id: "s-b", total: 500, hlcTimestamp: 1_000, syncVersion: 1, updatedAt: 1_000, lastModifiedDeviceId: "B" }];

  const merged = mergeSnapshots(offlineA, offlineB).snapshot;
  const products = rowMap(merged, "products");
  assert.deepEqual([...products.keys()].sort(), ["p-a", "p-b", "p-shared"]);
  assert.equal(products.get("p-shared")?.name, "B version");
  assert.equal(rowMap(merged, "sales").has("s-b"), true);
});

test("tombstone beats an older edit but loses to a strictly newer edit", () => {
  // Delete on A at HLC 8000; stale edit on B at HLC 3000 must stay deleted.
  const deleted = emptySnapshot();
  deleted.tombstones = [{ id: "products:p-1", tableName: "products", recordId: "p-1", deletedAt: 8_000, hlcTimestamp: 8_000, deletedByDeviceId: "A" }];
  const staleEdit = emptySnapshot();
  staleEdit.products = [{ id: "p-1", name: "Stale", hlcTimestamp: 3_000, syncVersion: 1, updatedAt: 3_000, lastModifiedDeviceId: "B" }];
  assert.equal(rowMap(mergeSnapshots(deleted, staleEdit).snapshot, "products").has("p-1"), false);
  assert.equal(rowMap(mergeSnapshots(staleEdit, deleted).snapshot, "products").has("p-1"), false);

  // A genuinely newer edit (HLC 9000) after the delete resurrects the row.
  const freshEdit = emptySnapshot();
  freshEdit.products = [{ id: "p-1", name: "Recreated", hlcTimestamp: 9_000, syncVersion: 2, updatedAt: 9_000, lastModifiedDeviceId: "B" }];
  const resurrected = mergeSnapshots(deleted, freshEdit).snapshot;
  assert.equal(rowMap(resurrected, "products").get("p-1")?.name, "Recreated");
});

test("deleting a sale on one device removes its orphaned line items everywhere", () => {
  const withSale = emptySnapshot();
  withSale.sales = [{ id: "s-1", total: 100, hlcTimestamp: 1_000, syncVersion: 1, updatedAt: 1_000, lastModifiedDeviceId: "A" }];
  withSale.saleItems = [{ id: "si-1", saleId: "s-1", productId: "p-1" }];
  const deletedSale = emptySnapshot();
  deletedSale.tombstones = [{ id: "sales:s-1", tableName: "sales", recordId: "s-1", deletedAt: 2_000, hlcTimestamp: 2_000, deletedByDeviceId: "A" }];
  deletedSale.saleItems = [{ id: "si-1", saleId: "s-1", productId: "p-1" }];

  const merged = mergeSnapshots(withSale, deletedSale).snapshot;
  assert.equal(rowMap(merged, "sales").has("s-1"), false);
  assert.equal(merged.saleItems.length, 0);
});

test("legacy record with HLC 0 falls back to version/updatedAt ordering", () => {
  const legacy = emptySnapshot();
  legacy.products = [{ id: "p-1", name: "Legacy", hlcTimestamp: 0, syncVersion: 1, updatedAt: 1_000, lastModifiedDeviceId: "A" }];
  const modern = emptySnapshot();
  modern.products = [{ id: "p-1", name: "Modern", hlcTimestamp: 0, syncVersion: 2, updatedAt: 2_000, lastModifiedDeviceId: "B" }];

  assert.equal(rowMap(mergeSnapshots(legacy, modern).snapshot, "products").get("p-1")?.name, "Modern");
  assert.equal(rowMap(mergeSnapshots(modern, legacy).snapshot, "products").get("p-1")?.name, "Modern");
});

test("credential merge is order-independent and never resurrects a redacted export over a real hash", () => {
  const real = emptySnapshot();
  real.users = [{ id: "u-1", username: "owner", pinHash: "pbkdf2:real", password: "pw:real", hlcTimestamp: 0, syncVersion: 1, updatedAt: 1_000, lastModifiedDeviceId: "A" }];
  const redacted = emptySnapshot();
  redacted.users = [{ id: "u-1", username: "owner", pinHash: "", password: "", hlcTimestamp: 0, syncVersion: 1, updatedAt: 1_000, lastModifiedDeviceId: "B" }];

  for (const merged of [mergeSnapshots(real, redacted).snapshot, mergeSnapshots(redacted, real).snapshot]) {
    const user = rowMap(merged, "users").get("u-1");
    assert.equal(user?.pinHash, "pbkdf2:real");
    assert.equal(user?.password, "pw:real");
  }
});

test("three-way merge is associative on the convergent row set", () => {
  const a = emptySnapshot();
  a.products = [{ id: "p-1", name: "A", hlcTimestamp: 3_000, syncVersion: 1, updatedAt: 3_000, lastModifiedDeviceId: "A" }];
  a.customers = [{ id: "c-1", name: "Cust", hlcTimestamp: 1_000, syncVersion: 1, updatedAt: 1_000, lastModifiedDeviceId: "A" }];
  const b = emptySnapshot();
  b.products = [{ id: "p-1", name: "B", hlcTimestamp: 5_000, syncVersion: 1, updatedAt: 5_000, lastModifiedDeviceId: "B" }];
  b.sales = [{ id: "s-1", total: 10, hlcTimestamp: 2_000, syncVersion: 1, updatedAt: 2_000, lastModifiedDeviceId: "B" }];
  const c = emptySnapshot();
  c.products = [{ id: "p-1", name: "C", hlcTimestamp: 4_000, syncVersion: 1, updatedAt: 4_000, lastModifiedDeviceId: "C" }];
  c.purchases = [{ id: "buy-1", total: 99 }];

  const left = mergeSnapshots(mergeSnapshots(a, b).snapshot, c).snapshot;
  const right = mergeSnapshots(a, mergeSnapshots(b, c).snapshot).snapshot;
  assert.equal(convergenceSignature(left), convergenceSignature(right));
  assert.equal(rowMap(left, "products").get("p-1")?.name, "B");
});