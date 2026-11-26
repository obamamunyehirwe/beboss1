import assert from "node:assert/strict";
import test from "node:test";
import { parseAcceptedSnapshotMarker, shouldPromptForRemoteRestore } from "./device-restore.ts";
import type { RestorePreview } from "./types";

const preview = (overrides: Partial<RestorePreview> = {}): RestorePreview => ({
  ok: true,
  shopSyncKey: "shop-1",
  restoreAvailable: true,
  snapshotUpdatedAt: 2_000,
  verifiedChunks: 4,
  totalRecords: 25,
  counts: {
    products: 3, customers: 2, sales: 4, saleItems: 8, customerPayments: 1,
    purchases: 2, stockTransfers: 1, branches: 2, users: 2
  },
  sourceDevices: [{ deviceId: "ANDROID:phone-1", name: "Phone", platform: "ANDROID", lastSyncedAt: 2_000 }],
  ...overrides
});

test("prompts a fresh installation before it enters an empty shop", () => {
  assert.equal(shouldPromptForRemoteRestore(preview(), {
    installationId: "desktop-1", hasLocalBusinessData: false, localUpdatedAt: 0, lastAcceptedSnapshotAt: 0
  }), true);
});

test("prompts when another device has a newer verified cloud generation", () => {
  assert.equal(shouldPromptForRemoteRestore(preview(), {
    installationId: "desktop-1", hasLocalBusinessData: true, localUpdatedAt: 1_000, lastAcceptedSnapshotAt: 1_000
  }), true);
});

test("does not repeat a prompt for a generation the owner already accepted", () => {
  assert.equal(shouldPromptForRemoteRestore(preview(), {
    installationId: "desktop-1", hasLocalBusinessData: true, localUpdatedAt: 1_000, lastAcceptedSnapshotAt: 2_000
  }), false);
});

test("does not prompt when the local baseline is current", () => {
  assert.equal(shouldPromptForRemoteRestore(preview(), {
    installationId: "desktop-1", hasLocalBusinessData: true, localUpdatedAt: 2_000, lastAcceptedSnapshotAt: 0
  }), false);
});

test("does not offer a restore when the server has no verified records", () => {
  assert.equal(shouldPromptForRemoteRestore(preview({ restoreAvailable: false, totalRecords: 0 }), {
    installationId: "desktop-1", hasLocalBusinessData: false, localUpdatedAt: 0, lastAcceptedSnapshotAt: 0
  }), false);
});

test("reads both versioned markers and older timestamp-only markers", () => {
  assert.equal(parseAcceptedSnapshotMarker(JSON.stringify({
    snapshotUpdatedAt: 1_234, acceptedAt: "2026-11-26T00:00:00.000Z"
  })), 1_234);
  assert.equal(parseAcceptedSnapshotMarker("2026-11-26T00:00:00.000Z"), Date.parse("2026-11-26T00:00:00.000Z"));
});
