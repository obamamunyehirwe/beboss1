export type BranchOperationalStatus = "OPEN" | "PAUSED" | "CLOSED";

/** Normalize legacy SUSPENDED rows to the canonical PAUSED state. */
export function normalizeBranchOperationalStatus(value: unknown): BranchOperationalStatus {
  const raw = value == null || !String(value).trim() ? "OPEN" : String(value).trim().toUpperCase();
  const normalized = raw === "SUSPENDED" ? "PAUSED" : raw;
  if (normalized !== "OPEN" && normalized !== "PAUSED" && normalized !== "CLOSED") {
    throw new Error("Branch operating status must be OPEN, PAUSED or CLOSED.");
  }
  return normalized;
}

/** Stock can move only while both locations are active and operational. */
export function assertBranchesOpenForTransfer(sourceStatus: unknown, destinationStatus: unknown): void {
  const source = normalizeBranchOperationalStatus(sourceStatus);
  const destination = normalizeBranchOperationalStatus(destinationStatus);
  if (source !== "OPEN" || destination !== "OPEN") {
    throw new Error("Both source and destination branches must be OPEN before stock can move.");
  }
}
