import type { RestorePreview } from "./types";

export type RestoreDecisionInput = {
  installationId: string;
  hasLocalBusinessData: boolean;
  localUpdatedAt: number;
  lastAcceptedSnapshotAt: number;
};

function normalizedDeviceId(value: string): string {
  const clean = value.trim();
  return clean.toUpperCase().startsWith("DESKTOP:") ? clean.slice("DESKTOP:".length) : clean;
}

/**
 * A restore confirmation is required for a device with no shop data, or when
 * another device has published a newer verified snapshot than this desktop's
 * accepted baseline. Reopening the same already-accepted generation never
 * blocks sign-in with a duplicate prompt.
 */
export function shouldPromptForRemoteRestore(
  preview: RestorePreview,
  input: RestoreDecisionInput,
): boolean {
  if (!preview.restoreAvailable || preview.totalRecords <= 0 || preview.sourceDevices.length === 0) {
    return false;
  }

  const remoteUpdatedAt = Math.max(0, Number(preview.snapshotUpdatedAt) || 0);
  const lastAccepted = Math.max(0, Number(input.lastAcceptedSnapshotAt) || 0);
  if (remoteUpdatedAt > 0 && lastAccepted >= remoteUpdatedAt) return false;

  const localUpdatedAt = Math.max(0, Number(input.localUpdatedAt) || 0);
  const localIsEmpty = !input.hasLocalBusinessData;
  const remoteIsNewerThanLocal = remoteUpdatedAt > localUpdatedAt;

  // Even a snapshot created by the same terminal may need retrieval after a
  // cache/key recovery. The user must never be forced into an empty shop.
  return localIsEmpty || remoteIsNewerThanLocal;
}

export function parseAcceptedSnapshotMarker(value: string | null | undefined): number {
  if (!value) return 0;
  const raw = value.trim();
  if (!raw) return 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  try {
    const parsed = JSON.parse(raw) as { snapshotUpdatedAt?: unknown; acceptedAt?: unknown };
    const snapshotUpdatedAt = Number(parsed?.snapshotUpdatedAt);
    if (Number.isFinite(snapshotUpdatedAt) && snapshotUpdatedAt > 0) return snapshotUpdatedAt;
    const acceptedAt = typeof parsed?.acceptedAt === "string" ? Date.parse(parsed.acceptedAt) : Number(parsed?.acceptedAt);
    return Number.isFinite(acceptedAt) && acceptedAt > 0 ? acceptedAt : 0;
  } catch {
    const timestamp = Date.parse(raw);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
  }
}
