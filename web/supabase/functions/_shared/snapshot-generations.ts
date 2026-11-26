/**
 * Pure helpers for immutable cloud snapshot generation grouping and validation.
 * Normalize legacy chunk-specific device IDs before grouping a peer's generations.
 */
export function snapshotDeviceBaseId(deviceId: string): string {
  return String(deviceId ?? "").replace(/#c\d+$/, "");
}

export function isCompleteSnapshotGeneration(
  chunks: ReadonlyArray<{ chunkIndex: number; chunkCount: number }>
): boolean {
  if (!chunks.length) return false;
  const expected = Number(chunks[0]?.chunkCount);
  if (!Number.isInteger(expected) || expected < 1 || expected > 100_000) return false;
  if (chunks.some((chunk) => !Number.isInteger(chunk.chunkCount) || chunk.chunkCount !== expected)) return false;
  const indexes = new Set(chunks.map((chunk) => chunk.chunkIndex));
  if (indexes.size !== expected || chunks.length !== expected) return false;
  for (let index = 0; index < expected; index += 1) {
    if (!indexes.has(index)) return false;
  }
  return true;
}
