import { isCompleteSnapshotGeneration, snapshotDeviceBaseId } from "./snapshot-generations.ts";

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(label + ": expected " + String(expected) + ", got " + String(actual));
}

Deno.test("snapshotDeviceBaseId removes a numeric chunk suffix only", () => {
  equal(snapshotDeviceBaseId("android-device#c0"), "android-device", "chunk 0");
  equal(snapshotDeviceBaseId("android-device#c12"), "android-device", "chunk 12");
  equal(snapshotDeviceBaseId("DESKTOP:9e2d1f3a-0000-4000-8000-000000000000"),
    "DESKTOP:9e2d1f3a-0000-4000-8000-000000000000", "desktop ID");
  equal(snapshotDeviceBaseId("device#cx"), "device#cx", "non-numeric suffix");
});

Deno.test("complete snapshot generation accepts all unique chunks in any order", () => {
  equal(isCompleteSnapshotGeneration([
    { chunkIndex: 2, chunkCount: 3 },
    { chunkIndex: 0, chunkCount: 3 },
    { chunkIndex: 1, chunkCount: 3 }
  ]), true, "complete out-of-order generation");
});

Deno.test("incomplete, duplicate, out-of-range and inconsistent chunks fail closed", () => {
  equal(isCompleteSnapshotGeneration([
    { chunkIndex: 0, chunkCount: 3 }, { chunkIndex: 1, chunkCount: 3 }
  ]), false, "missing chunk");
  equal(isCompleteSnapshotGeneration([
    { chunkIndex: 0, chunkCount: 2 }, { chunkIndex: 0, chunkCount: 2 }
  ]), false, "duplicate chunk");
  equal(isCompleteSnapshotGeneration([
    { chunkIndex: 0, chunkCount: 2 }, { chunkIndex: 2, chunkCount: 2 }
  ]), false, "out-of-range chunk");
  equal(isCompleteSnapshotGeneration([
    { chunkIndex: 0, chunkCount: 2 }, { chunkIndex: 1, chunkCount: 3 }
  ]), false, "inconsistent chunk count");
  equal(isCompleteSnapshotGeneration([{ chunkIndex: 0, chunkCount: 100001 }]), false, "oversized generation");
  equal(isCompleteSnapshotGeneration([]), false, "empty generation");
});
