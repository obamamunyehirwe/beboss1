import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const desktop = read("desktop/src/components/screens/BackupPage.tsx");
const desktopApi = read("web/supabase/functions/beboss-desktop/index.ts");
const androidManager = read("app/src/main/java/com/beboss/shopmgmt/util/ShopDataTransferManager.kt");
const androidCoordinator = read("app/src/main/java/com/beboss/shopmgmt/ui/viewmodel/coordinators/SyncCoordinator.kt");
const androidDialog = read("app/src/main/java/com/beboss/shopmgmt/ui/screens/DataTransferDialog.kt");
const settings = read("app/src/main/java/com/beboss/shopmgmt/ui/screens/SettingsScreen.kt");

const checks = [
  ["desktop branch-share creation requires BBSHARE2", /if \(!token\.startsWith\("BBSHARE2:"\)\)/.test(desktop)],
  ["desktop import accepts BBSHARE2 and migration-era BBSHARE1", /startsWith\("BBSHARE2:"\).*startsWith\("BBSHARE1:"\)/.test(desktop)],
  ["server emits shop-scoped BBSHARE2", /const token = "BBSHARE2:" \+ signature/.test(desktopApi)],
  ["server verifies imports in the authenticated shop context", /if \(action === "verify_branch_share"\)[\s\S]*?getShopDataShareSecret\(admin, owner\.shopId\)/.test(desktopApi)],
  ["Android emits BBSHARE2 from the shop-scoped key", /fun createShopScopedShareToken[\s\S]*?SHOP_SHARE_TOKEN_PREFIX/.test(androidManager)],
  ["Android import verifies BBSHARE2 with the paired shop secret", /parseShopPackageString\([\s\S]*?shopSecret = shopSecret/.test(androidCoordinator)],
  ["manual Android import routes signed tokens through the authenticated import callback", /candidate\.startsWith\("BBSHARE2:"\)[\s\S]*?onImportBranchToken/.test(androidDialog)],
  ["Settings forwards the signed-token import callback to Data Transfer", /onImportBranchToken = onImportBranchToken/.test(settings)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log((ok ? "PASS " : "FAIL ") + label);
if (failed.length) process.exitCode = 1;
