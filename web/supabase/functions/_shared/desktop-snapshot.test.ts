import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.14";
import {
  completeSnapshotRows,
  createDesktopSnapshotChunks,
  decodeDesktopShareToken,
  encodeDesktopShareToken,
  mergeDesktopSnapshotParts,
  type SnapshotDataset,
  type SnapshotRow,
} from "./desktop-snapshot.ts";

const secret = "test-only-desktop-snapshot-hmac-secret";

function emptyDataset(): SnapshotDataset {
  return {
    metadata: {},
    shopProfile: { id: 1, shopName: "Test Shop", currencySymbol: "FRw" },
    products: [],
    customers: [],
    sales: [],
    saleItems: [],
    customerPayments: [],
    purchases: [],
    stockTransfers: [],
    branches: [],
    users: [],
    tombstones: [],
  };
}

Deno.test("desktop snapshot token round-trips a BBSHARE1 compressed payload", async () => {
  const payload = { metadata: { schemaVersion: 3 }, products: [{ id: "p1", name: "Tea" }] };
  const token = await encodeDesktopShareToken(payload, secret);
  assert(token.startsWith("BBSHARE1:"));
  assertEquals(await decodeDesktopShareToken(token, secret), payload);
});

Deno.test("desktop snapshot decoder rejects modified signatures and wrong keys", async () => {
  const token = await encodeDesktopShareToken({ products: [{ id: "p1" }] }, secret);
  const [prefix, signature, payload] = token.split(":");
  const altered = (payload![0] === "A" ? "B" : "A") + payload!.slice(1);
  await assertRejects(() => decodeDesktopShareToken(prefix + ":" + signature + ":" + altered, secret));
  await assertRejects(() => decodeDesktopShareToken(token, "different-secret"));
});

Deno.test("desktop snapshot chunking follows the Android share schema", () => {
  const source = emptyDataset();
  source.products = Array.from({ length: 251 }, (_, index) => ({
    id: "product-" + index, updatedAt: index + 1, quantityInStock: 5,
  }));
  const chunks = createDesktopSnapshotChunks(source, 1000, "DESKTOP-12345678-1234-1234-1234-123456789ABC", "Owner");
  assertEquals(chunks.length, 2);
  assertEquals((chunks[0]!.products as unknown[]).length, 250);
  assertEquals((chunks[1]!.products as unknown[]).length, 1);
  const firstMeta = chunks[0]!._desktopMeta as SnapshotRow;
  const secondMeta = chunks[1]!._desktopMeta as SnapshotRow;
  assertEquals(firstMeta.syncGeneration, secondMeta.syncGeneration);
  assertEquals(firstMeta.chunkCount, 2);
});

Deno.test("incomplete newest snapshot generation falls back to the newest complete set", () => {
  const rows: SnapshotRow[] = [
    { device_id: "DESKTOP-ABC", sync_generation: "old", chunk_index: 0, chunk_count: 2, updated_at: 10 },
    { device_id: "DESKTOP-ABC#c1", sync_generation: "old", chunk_index: 1, chunk_count: 2, updated_at: 11 },
    { device_id: "DESKTOP-ABC", sync_generation: "new", chunk_index: 0, chunk_count: 2, updated_at: 20 },
  ];
  const result = completeSnapshotRows(rows);
  assertEquals(result.length, 1);
  assertEquals(result[0]!.map((row) => row.sync_generation), ["old", "old"]);
});

Deno.test("legacy chunked Android snapshots are recovered by their device suffix", () => {
  const result = completeSnapshotRows([
    { device_id: "PHONE-A", records_summary: "0 branches • 251 items (2 chunk(s))", updated_at: 10 },
    { device_id: "PHONE-A#c1", records_summary: "0 branches • 251 items (2 chunk(s))", updated_at: 11 },
  ]);
  assertEquals(result.length, 1);
  assertEquals(result[0]!.map((row) => row.device_id), ["PHONE-A", "PHONE-A#c1"]);
});

Deno.test("snapshot merge prefers newer HLC rows and applies tombstones", () => {
  const remote = {
    ...emptyDataset(),
    products: [{ id: "p1", name: "Old name", updatedAt: 10, hlcTimestamp: 10, lastModifiedDeviceId: "PHONE" }],
    customers: [{ id: "c1", name: "Delete me", updatedAt: 10, hlcTimestamp: 10 }],
  };
  const incoming = {
    ...emptyDataset(),
    products: [{ id: "p1", name: "New name", updatedAt: 20, hlcTimestamp: 20, lastModifiedDeviceId: "DESKTOP" }],
    customers: [],
    tombstones: [{ recordId: "c1", deletedAt: 30 }],
  };
  const merged = mergeDesktopSnapshotParts([
    { metadata: { timestamp: 100 }, ...remote },
    { metadata: { timestamp: 200 }, ...incoming },
  ]);
  assertEquals(merged.products[0]!.name, "New name");
  assertEquals(merged.customers.length, 0);
  assertEquals(merged.tombstones.length, 1);
});
