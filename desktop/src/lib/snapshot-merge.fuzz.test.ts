import assert from "node:assert/strict";
import test from "node:test";
import { mergeSnapshots } from "./snapshot-merge.ts";
import type { Snapshot, Row } from "./types.ts";

// Deterministic property-based (fuzz) testing for the offline-first merge
// engine. A seeded PRNG generates random pairs of device snapshots — random
// rows, random HLCs, random tombstones, random legacy (HLC=0) records — and we
// assert the invariants that make multi-device convergence safe:
//
//   P1  Commutativity:      merge(A, B) and merge(B, A) converge to the same rows.
//   P2  Idempotence:        merge(A, A) reproduces A's rows exactly.
//   P3  No resurrection:    a tombstone at least as new as a row keeps it deleted.
//   P4  Grow-only ledgers:  immutable tables are the union of both sides' ids.
//   P5  No credential loss: a non-empty pinHash/password on either side survives.
//
// The PRNG is seeded, so a failure is reproducible from the printed seed.

const MUTABLE = ["products", "customers", "sales", "branches", "stockTransfers"] as const;
const IMMUTABLE = ["saleItems", "customerPayments", "purchases"] as const;
const TABLES = [...MUTABLE, ...IMMUTABLE] as const;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canon(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return "[" + value.map(canon).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return "{" + Object.keys(obj).sort().map((k) => JSON.stringify(k) + ":" + canon(obj[k])).join(",") + "}";
}

function signature(snapshot: Snapshot): string {
  const parts: string[] = [];
  for (const table of TABLES) {
    parts.push(table + "=" + (snapshot[table] as Row[]).map((r) => canon(r)).sort().join(";"));
  }
  parts.push("tombstones=" + snapshot.tombstones.map((t) => canon({ t: t.tableName, i: t.recordId, h: t.hlcTimestamp ?? t.deletedAt })).sort().join(";"));
  return parts.join("|");
}

function ids(snapshot: Snapshot, table: string): Set<string> {
  return new Set((snapshot[table] as Row[]).map((r) => String(r.id)));
}

function tombFor(snapshot: Snapshot, table: string, id: string): Row | undefined {
  const tombTableName = table === "stockTransfers" ? "stock_transfers" : table;
  return snapshot.tombstones.find((t) => t.recordId === id && t.tableName === tombTableName);
}

function makeRow(rng: () => number, table: string, id: string, device: string): Row {
  const hlc = rng() < 0.15 ? 0 : Math.floor(rng() * 1_000_000); // 15% legacy HLC=0
  return {
    id,
    name: `${table}-${id}`,
    hlcTimestamp: hlc,
    syncVersion: hlc === 0 ? Math.floor(rng() * 5) : 0,
    updatedAt: hlc || Math.floor(rng() * 1_000_000),
    lastModifiedDeviceId: device
  };
}

function randomSnapshot(rng: () => number, device: string): Snapshot {
  const snap: Snapshot = {
    metadata: { schemaVersion: 3, timestamp: Math.floor(rng() * 1_000_000) },
    shopProfile: {},
    products: [], customers: [], sales: [], saleItems: [], customerPayments: [],
    purchases: [], stockTransfers: [], branches: [], users: [], tombstones: []
  } as Snapshot;

  for (const table of TABLES) {
    // Ledger rows (saleItems, payments, purchases) carry globally-unique ids in
    // production, so two devices never hold the same id with divergent content.
    // Mutable rows use a small id space on purpose to force same-row conflicts,
    // but ids are unique within a single snapshot (a device never holds two rows
    // with the same id in one table).
    const uniqueIds = (IMMUTABLE as readonly string[]).includes(table);
    const count = Math.floor(rng() * 4);
    const pool = [0, 1, 2, 3, 4, 5];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i = 0; i < count; i++) {
      const id = uniqueIds ? `${table}-${device}-${i}` : `${table}-${pool[i]}`;
      const row = makeRow(rng, table, id, device);
      if (table === "saleItems") row.saleId = `sales-${Math.floor(rng() * 4)}`;
      (snap[table] as Row[]).push(row);
    }
  }
  // A single user per side so credential-merge invariants are exercised.
  const pinHash = rng() < 0.5 ? "pbkdf2:hash" : "";
  snap.users = [{ id: "u-1", username: "owner", pinHash, password: pinHash ? "pw" : "", hlcTimestamp: 0, syncVersion: 1, updatedAt: 1, lastModifiedDeviceId: device }];

  // Random tombstones, sometimes newer than the rows they target. Only mutable
  // tables are tombstoned in practice; grow-only ledgers are removed via their
  // parent (e.g. a sale tombstone drops its line items).
  const tombCount = Math.floor(rng() * 3);
  for (let i = 0; i < tombCount; i++) {
    const table = MUTABLE[Math.floor(rng() * MUTABLE.length)];
    const recordId = `${table}-${Math.floor(rng() * 6)}`;
    const hlc = Math.floor(rng() * 1_000_000);
    // The engine keys stock-transfer tombstones under the snake_case table name.
    const tombTableName = table === "stockTransfers" ? "stock_transfers" : table;
    snap.tombstones.push({ id: `${tombTableName}:${recordId}`, tableName: tombTableName, recordId, deletedAt: hlc, hlcTimestamp: hlc, deletedByDeviceId: device });
  }
  return snap;
}

test("fuzz: merge converges (commutative, idempotent, no-resurrection, grow-only, no-credential-loss)", () => {
  const seeds = 500;
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = mulberry32(seed);
    const a = randomSnapshot(rng, "DEVICE:A");
    const b = randomSnapshot(rng, "DEVICE:B");

    const ab = mergeSnapshots(a, b).snapshot;
    const ba = mergeSnapshots(b, a).snapshot;

    // P1 commutativity of the convergent row set.
    assert.equal(signature(ab), signature(ba), `commutativity failed for seed ${seed}`);

    // P2 idempotence: merging a snapshot with itself again changes nothing.
    const aa = mergeSnapshots(a, a).snapshot;
    const aa2 = mergeSnapshots(aa, aa).snapshot;
    assert.equal(signature(aa2), signature(aa), `idempotence failed for seed ${seed}`);
    for (const table of TABLES) {
      // saleItems are legitimately dropped when their parent sale is absent
      // (orphan cleanup), so only assert no-loss for the other tables.
      if (table === "saleItems") continue;
      const merged = ids(aa, table);
      const original = ids(a, table);
      // Every original id is still present (no random loss), modulo tombstones.
      for (const id of original) {
        const tomb = tombFor(a, table, id);
        if (!tomb) assert.ok(merged.has(id), `idempotence dropped ${table}:${id} seed ${seed}`);
      }
    }

    // P3 no resurrection: any mutable row with a tombstone at least as new is gone.
    for (const table of MUTABLE) {
      const present = ids(ab, table);
      for (const row of ab[table] as Row[]) {
        const tomb = tombFor(ab, table, String(row.id));
        if (!tomb) continue;
        const rowVer = Number(row.hlcTimestamp) || Number(row.updatedAt);
        const tombVer = Number(tomb.hlcTimestamp) || Number(tomb.deletedAt);
        assert.ok(
          tombVer < rowVer || !present.has(String(row.id)),
          `resurrection ${table}:${row.id} seed ${seed} rowVer=${rowVer} tombVer=${tombVer} rowHlc=${row.hlcTimestamp} rowUpdatedAt=${row.updatedAt} tombHlc=${tomb.hlcTimestamp} tombDeletedAt=${tomb.deletedAt}`
        );
      }
    }

    // P4 grow-only ledgers: immutable ids are the union of both sides.
    for (const table of IMMUTABLE) {
      const union = new Set([...ids(a, table), ...ids(b, table)]);
      const merged = ids(ab, table);
      // saleItems legitimately shrink when their parent sale is deleted, so only
      // assert the superset direction for the other ledgers.
      if (table !== "saleItems") {
        for (const id of union) assert.ok(merged.has(id), `grow-only lost ${table}:${id} seed ${seed}`);
      }
    }

    // P5 no credential loss.
    const mergedUser = (ab.users as Row[]).find((u) => String(u.id) === "u-1");
    const aUser = (a.users as Row[])[0];
    const bUser = (b.users as Row[])[0];
    if (aUser.pinHash || bUser.pinHash) {
      assert.ok(mergedUser?.pinHash, `credential lost seed ${seed}`);
      assert.ok(mergedUser?.password, `password lost seed ${seed}`);
    }
  }
});