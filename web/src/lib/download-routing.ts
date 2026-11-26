export type DownloadPlatform = "mobile" | "desktop";
export type DesktopOS = "windows" | "macos" | "linux";

/** Build a shareable route for the selected application and installer target. */
export function buildDownloadHref(platform: DownloadPlatform, os: DesktopOS = "windows"): string {
  if (platform === "mobile") return "/download";
  return `/download?platform=desktop&os=${os}`;
}

/** Suggest the visitor's desktop OS without treating Android as Linux. */
export function detectDesktopOS(userAgent: string): DesktopOS {
  const value = userAgent.toLowerCase();
  if (value.includes("mac")) return "macos";
  if (value.includes("windows")) return "windows";
  if (value.includes("linux") && !value.includes("android")) return "linux";
  return "windows";
}
