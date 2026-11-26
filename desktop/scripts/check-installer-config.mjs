import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const readJson = (file) => JSON.parse(readFileSync(resolve(file), "utf8"));
const config = readJson("src-tauri/tauri.conf.json");
const nsis = config.bundle?.windows?.nsis;
const webviewInstallMode = config.bundle?.windows?.webviewInstallMode;
const failures = [];
const requireCheck = (condition, message) => { if (!condition) failures.push(message); };

requireCheck(config.bundle?.targets?.includes("nsis"), "The release bundle must include the NSIS setup executable.");
requireCheck(nsis?.installMode === "currentUser", "The installer must use currentUser mode so shop staff do not need administrator rights.");
requireCheck(nsis?.displayLanguageSelector === false, "The branded installer should use the Windows language by default without an extra legacy selector page.");
requireCheck(webviewInstallMode?.type === "embedBootstrapper", "The WebView2 bootstrapper must be embedded so installation does not need to download the bootstrapper first.");
requireCheck(webviewInstallMode?.silent === true, "WebView2 bootstrapper installation must run silently.");
requireCheck(Boolean(nsis?.installerHooks), "NSIS installerHooks must be configured.");

for (const key of ["headerImage", "sidebarImage", "uninstallerHeaderImage", "installerIcon", "uninstallerIcon"]) {
  const value = nsis?.[key];
  requireCheck(typeof value === "string" && existsSync(resolve("src-tauri", value)), `Configured NSIS asset is missing: ${key} (${value ?? "unset"}).`);
}

if (nsis?.installerHooks) {
  const hookPath = resolve("src-tauri", nsis.installerHooks);
  requireCheck(existsSync(hookPath), `NSIS lifecycle hook file does not exist: ${hookPath}`);
  if (existsSync(hookPath)) {
    const hooks = readFileSync(hookPath, "utf8");
    for (const macro of ["PREINSTALL", "POSTINSTALL", "PREUNINSTALL", "POSTUNINSTALL", "PREFINISHPAGE"]) {
      requireCheck(hooks.includes(`!macro NSIS_HOOK_${macro}`), `Missing NSIS lifecycle macro: ${macro}`);
    }
    requireCheck(hooks.includes("taskkill.exe") && !/taskkill\.exe[^\n]*\/F/i.test(hooks), "Upgrade/uninstall should request a graceful app close rather than force-kill the live session.");
    requireCheck(/existing installation/i.test(hooks) && /in-place upgrade/i.test(hooks), "The installer must explicitly detect and handle an existing installation.");
    requireCheck(/encrypted local database[\s\S]*preserved/i.test(hooks), "The upgrade confirmation must explain that protected encrypted shop data is retained.");
    requireCheck(/MUI_FINISHPAGE_RUN/.test(hooks) && /Launch BeBoss Desktop/.test(hooks), "The finish page must offer a direct first launch.");
    requireCheck(!/^\s*(?:Delete|RMDir)\s+.*\$(?:APPDATA|LOCALAPPDATA|PROFILE)/im.test(hooks), "NSIS must never delete the user's application-data directories.");
    requireCheck(!/^\s*(?:Delete|RMDir)\s+.*(?:beboss-local\.sqlite|pending-outbox|dpapi-key|recovery)/im.test(hooks), "NSIS must never delete the encrypted database, pending queue, DPAPI key backup or recovery archives.");
  }
}

if (failures.length) {
  process.stderr.write("BeBoss NSIS installer policy check failed:\n" + failures.map((item) => ` - ${item}`).join("\n") + "\n");
  process.exit(1);
}

console.log("BeBoss NSIS configuration passed: branded assets, current-user install, embedded WebView2 bootstrapper, upgrade/repair flow and protected-data retention.");
