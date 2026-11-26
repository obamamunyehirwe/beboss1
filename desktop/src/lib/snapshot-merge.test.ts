import assert from "node:assert/strict";
import test from "node:test";
import { mergeSnapshots } from "./snapshot-merge.ts";
import type { Snapshot, Row } from "./types.ts";

function emptySnapshot(): Snapshot {
  return {
    metadata: { schemaVersion: 3, timestamp: 0 },
    shopProfile: {},
    products: [] as Row[], customers: [] as Row[], sales: [] as Row[], saleItems: [] as Row[], customerPayments: [] as Row[],
    purchases: [] as Row[], stockTransfers: [] as Row[], branches: [] as Row[], users: [] as Row[], tombstones: [] as Row[]
  };
}

function phoneSnapshot(): Snapshot {
  return {
    metadata: { schemaVersion: 3, timestamp: 2_000 },
    shopProfile: { shopName: "Phone Shop", updatedAt: 2_000, hlcTimestamp: 2_000 },
    products: [{ id: "p-1", name: "Laptop", updatedAt: 2_000, hlcTimestamp: 2_000 }],
    customers: [{ id: "c-1", name: "Customer", updatedAt: 2_000, hlcTimestamp: 2_000 }],
    sales: [{ id: "s-1", total: 120_000, updatedAt: 2_000, hlcTimestamp: 2_000 }],
    saleItems: [{ id: "si-1", saleId: "s-1", productId: "p-1" }],
    customerPayments: [{ id: "cp-1", customerId: "c-1", amount: 5_000 }],
    purchases: [{ id: "buy-1", total: 80_000 }],
    stockTransfers: [{ id: "tr-1", status: "PENDING", updatedAt: 2_000, hlcTimestamp: 2_000 }],
    branches: [{ id: "b-1", name: "Main", updatedAt: 2_000, hlcTimestamp: 2_000 }],
    users: [{ id: "u-1", username: "owner", pinHash: "pbkdf2v2:hash" }],
    tombstones: []
  };
}

test("first-time LAN recovery imports the full phone snapshot into an empty desktop", () => {
  const { snapshot } = mergeSnapshots(emptySnapshot(), phoneSnapshot());
  assert.equal(snapshot.products.length, 1);
  assert.equal(snapshot.customers.length, 1);
  assert.equal(snapshot.sales.length, 1);
  assert.equal(snapshot.saleItems.length, 1);
  assert.equal(snapshot.customerPayments.length, 1);
  assert.equal(snapshot.purchases.length, 1);
  assert.equal(snapshot.stockTransfers.length, 1);
  assert.equal(snapshot.branches.length, 1);
  assert.equal(snapshot.users.length, 1);
  assert.equal(snapshot.shopProfile.shopName, "Phone Shop");
});

test("LAN merge retains newer desktop records and merges phone-only records", () => {
  const desktop = emptySnapshot();
  desktop.metadata.timestamp = 3_000;
  desktop.products = [{ id: "p-1", name: "Updated laptop", updatedAt: 3_000, hlcTimestamp: 3_000 }];
  const phone = phoneSnapshot();
  phone.products.push({ id: "p-2", name: "Phone-only item", updatedAt: 2_000, hlcTimestamp: 2_000 });

  const { snapshot } = mergeSnapshots(desktop, phone);
  assert.equal(snapshot.products.length, 2);
  assert.equal(snapshot.products.find((row) => row.id === "p-1")?.name, "Updated laptop");
  assert.equal(snapshot.products.find((row) => row.id === "p-2")?.name, "Phone-only item");
});

test("LAN merge applies durable deletion tombstones instead of resurrecting deleted records", () => {
  const desktop = emptySnapshot();
  desktop.products = [{ id: "p-deleted", name: "Old item", updatedAt: 1_000, hlcTimestamp: 1_000 }];
  desktop.tombstones = [{
    id: "products:p-deleted", tableName: "products", recordId: "p-deleted",
    deletedAt: 4_000, hlcTimestamp: 4_000, deletedByDeviceId: "DESKTOP:test"
  }];
  const phone = phoneSnapshot();
  phone.products = [{ id: "p-deleted", name: "Stale phone item", updatedAt: 3_000, hlcTimestamp: 3_000 }];

  const { snapshot } = mergeSnapshots(desktop, phone);
  assert.equal(snapshot.products.some((row) => row.id === "p-deleted"), false);
  assert.equal(snapshot.tombstones.some((row) => row.recordId === "p-deleted"), true);
});

test("LAN merge never replaces an existing staff credential with a redacted phone export", () => {
  const desktop = emptySnapshot();
  desktop.users = [{ id: "u-1", username: "owner", pinHash: "existing-pbkdf-hash", password: "existing-password-hash" }];
  const phone = phoneSnapshot();
  phone.users = [{ id: "u-1", username: "owner", pinHash: "", password: "" }];

  const { snapshot } = mergeSnapshots(desktop, phone);
  assert.equal(snapshot.users[0].pinHash, "existing-pbkdf-hash");
  assert.equal(snapshot.users[0].password, "existing-password-hash");
});
