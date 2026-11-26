import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const checks = [
  {
    path: "app/build.gradle.kts",
    pattern: /buildConfigField\s*\(\s*"String"\s*,\s*"BEBOSS_LAN_SYNC_SECRET"/,
  },
  {
    path: "app/src/main/java/com/beboss/shopmgmt/util/LocalNetworkSyncServer.kt",
    pattern: /BuildConfig\.BEBOSS_LAN_SYNC_SECRET/,
  },
  {
    path: ".env.example",
    pattern: /^BEBOSS_LAN_SYNC_SECRET\s*=/m,
  },
];

const failures = [];
for (const check of checks) {
  const source = await readFile(resolve(repositoryRoot, check.path), "utf8");
  if (check.pattern.test(source)) failures.push(check.path);
}

if (failures.length > 0) {
  throw new Error(
    "The deprecated global LAN secret must never be compiled into Android clients or configured in the example environment: " +
      failures.join(", "),
  );
}

console.log("Android client secret check passed: no global LAN build secret is bundled.");
