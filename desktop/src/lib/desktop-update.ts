export type DesktopPlatform = "windows" | "macos" | "linux";

export type DesktopUpdateOffer = {
  id: string;
  platform: DesktopPlatform;
  version: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  releaseNotes: string;
  publishedAt: string;
  downloadUrl: string;
};

type ParsedVersion = { numbers: [number, number, number]; prerelease: string[] | null };

function parseVersion(value: string): ParsedVersion | null {
  const match = /^(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value.trim());
  if (!match) return null;
  const numbers = match.slice(1, 4).map(Number);
  if (numbers.some((number) => !Number.isSafeInteger(number) || number < 0)) return null;
  const prerelease = match[4] ? match[4].split(".") : null;
  if (prerelease?.some((part) => !part || !/^[0-9A-Za-z-]+$/.test(part))) return null;
  return { numbers: numbers as [number, number, number], prerelease };
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = /^\\d+$/.test(left);
  const rightNumeric = /^\\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const a = left.replace(/^0+(?=\\d)/, "");
    const b = right.replace(/^0+(?=\\d)/, "");
    return a.length !== b.length ? a.length < b.length ? -1 : 1 : a < b ? -1 : a > b ? 1 : 0;
  }
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

export function compareDesktopVersions(left: string, right: string): number | null {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1;
  }
  if (a.prerelease === null && b.prerelease === null) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  const length = Math.min(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const compared = compareIdentifiers(a.prerelease[index], b.prerelease[index]);
    if (compared !== 0) return compared;
  }
  return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length < b.prerelease.length ? -1 : 1;
}

export function parseDesktopUpdateOffer(
  value: unknown,
  installedVersion: string,
  expectedPlatform: DesktopPlatform,
): DesktopUpdateOffer | null {
  if (!value || typeof value !== "object") throw new Error("The desktop update service returned invalid metadata.");
  const raw = value as Record<string, unknown>;
  const id = String(raw.id ?? "");
  const platform = raw.platform;
  const version = String(raw.version ?? "");
  const fileName = String(raw.fileName ?? "");
  const sizeBytes = Number(raw.sizeBytes);
  const sha256 = String(raw.sha256 ?? "").toLowerCase();
  const downloadUrl = String(raw.downloadUrl ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id) || platform !== expectedPlatform) {
    throw new Error("The desktop update metadata does not match this installation.");
  }
  const versionOrder = compareDesktopVersions(version, installedVersion);
  if (versionOrder === null) throw new Error("The desktop update contains an invalid version.");
  if (versionOrder <= 0) return null;
  const extension = expectedPlatform === "windows" ? ".exe" : expectedPlatform === "macos" ? ".dmg" : ".appimage";
  if (!fileName.toLowerCase().endsWith(extension) || fileName.length > 200 ||
      fileName.includes("/") || fileName.includes("\\\\")) {
    throw new Error("The desktop update file name is invalid.");
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 536870912 || !/^[a-f0-9]{64}$/.test(sha256)) {
    throw new Error("The desktop update size or checksum is invalid.");
  }
  let url: URL;
  try { url = new URL(downloadUrl); } catch { throw new Error("The desktop update download URL is invalid."); }
  if (
    url.protocol !== "https:" ||
    url.origin !== "https://beboss.rw" ||
    url.pathname !== "/api/public/desktop-release/download" ||
    url.searchParams.get("id") !== id ||
    [...url.searchParams.keys()].some((key) => key !== "id")
  ) {
    throw new Error("The desktop update points to an untrusted download location.");
  }
  return {
    id, platform: expectedPlatform, version, fileName, sizeBytes, sha256,
    releaseNotes: typeof raw.releaseNotes === "string" ? raw.releaseNotes.slice(0, 5000) : "",
    publishedAt: typeof raw.publishedAt === "string" ? raw.publishedAt : "",
    downloadUrl: url.toString(),
  };
}
