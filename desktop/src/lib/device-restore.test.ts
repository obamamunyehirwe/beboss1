import { describe, expect, it } from "vitest";
import { parseAcceptedSnapshotMarker, shouldPromptForRemoteRestore } from "./device-restore";
import type { RestorePreview } from "./types";

const preview = (overrides: Partial<RestorePreview> = {}): RestorePreview => ({
  ok: true,
  restoreAvailable: true,
  snapshotUpdatedAt: 2_000,
  verifiedChunks: 4,
  totalRecords: 25,
  counts: {
    products: 3, customers: 2, sales: 4, saleItems: 8, customerPayments: 1,
    purchases: 2, stockTransfers: 1, branches: 2, users: 2
  },
  sourceDevices: [{ deviceId: "ANDROID:phone-1", name: "Phone", platform: "ANDROID", lastSyncedAt: 2_000 }],
  shopSyncKey: "shop-1",
  ...overrides
});

describe("version-aware desktop restore decision", () => {
  it("prompts a fresh installation before it enters an empty shop", () => {
    expect(shouldPromptForRemoteRestore(preview(), {
      installationId: "desktop-1", hasLocalBusinessData: false, localUpdatedAt: 0, lastAcceptedSnapshotAt: 0
    })).toBe(true);
  });

  it("prompts when another device has a newer verified cloud generation", () => {
    expect(shouldPromptForRemoteRestore(preview(), {
      installationId: "desktop-1", hasLocalBusinessData: true, localUpdatedAt: 1_000, lastAcceptedSnapshotAt: 1_000
    })).toBe(true);
  });

  it("does not repeat a prompt for a generation the owner already accepted", () => {
    expect(shouldPromptForRemoteRestore(preview(), {
      installationId: "desktop-1", hasLocalBusinessData: true, localUpdatedAt: 1_000, lastAcceptedSnapshotAt: 2_000
    })).toBe(false);
  });

  it("does not prompt when the local baseline is current", () => {
    expect(shouldPromptForRemoteRestore(preview(), {
      installationId: "desktop-1", hasLocalBusinessData: true, localUpdatedAt: 2_000, lastAcceptedSnapshotAt: 0
    })).toBe(false);
  });

  it("does not offer a restore when the server has no verified records", () => {
    expect(shouldPromptForRemoteRestore(preview({ restoreAvailable: false, totalRecords: 0 }), {
      installationId: "desktop-1", hasLocalBusinessData: false, localUpdatedAt: 0, lastAcceptedSnapshotAt: 0
    })).toBe(false);
  });

  it("reads both new version markers and old timestamp-only markers", () => {
    expect(parseAcceptedSnapshotMarker(JSON.stringify({ snapshotUpdatedAt: 1_234, acceptedAt: "2026-11-26T00:00:00.000Z" }))).toBe(1_234);
    expect(parseAcceptedSnapshotMarker("2026-11-26T00:00:00.000Z")).toBe(Date.parse("2026-11-26T00:00:00.000Z"));
  });
});
