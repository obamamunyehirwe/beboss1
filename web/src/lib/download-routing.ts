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
  // Mobile browsers can expose desktop-like platform tokens (Android/Linux,
  // iPadOS/Macintosh). Do not recommend a desktop installer from those tokens.
  if (/(android|iphone|ipad|ipod)/.test(value)) return "windows";
  if (value.includes("mac")) return "macos";
  if (value.includes("windows")) return "windows";
  if (value.includes("linux")) return "linux";
  return "windows";
}
