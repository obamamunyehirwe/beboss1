export function formatRwf(n: number | null | undefined): string {
  return `${Math.round(Number(n) || 0).toLocaleString("en-US")} FRw`;
}

export function formatDateTime(ms: number | string | null | undefined): string {
  if (ms == null || ms === "" || Number(ms) === 0) return "—";
  const d = typeof ms === "string" && Number.isNaN(Number(ms)) ? new Date(ms) : new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDate(ms: number | string | null | undefined): string {
  if (ms == null || ms === "" || Number(ms) === 0) return "—";
  const d = typeof ms === "string" && Number.isNaN(Number(ms)) ? new Date(ms) : new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function relativeTime(ms: number | string | null | undefined, now = Date.now()): string {
  if (ms == null || ms === "" || Number(ms) === 0) return "never";
  const t = typeof ms === "string" && Number.isNaN(Number(ms)) ? new Date(ms).getTime() : Number(ms);
  const diff = t - now;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000, "d"],
    [3_600_000, "h"],
    [60_000, "m"],
  ];
  for (const [size, label] of units) {
    if (abs >= size) {
      const v = Math.floor(abs / size);
      return diff < 0 ? `${v}${label} ago` : `in ${v}${label}`;
    }
  }
  return diff < 0 ? "just now" : "in <1m";
}

export function daysLeft(expiresAt: number, now = Date.now()): number {
  return Math.ceil((Number(expiresAt) - now) / 86_400_000);
}

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}
