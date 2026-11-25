#!/usr/bin/env node
import { readFileSync } from "node:fs";

const modules = [
  {
    file: "src/lib/admin.functions.ts",
    exceptions: new Set(["getAdminContext", "checkAppVersion"]),
  },
  {
    file: "src/lib/announcements.functions.ts",
    exceptions: new Set(),
  },
];

let failures = 0;
let checked = 0;

for (const module of modules) {
  const source = readFileSync(module.file, "utf8");
  const declarations = [...source.matchAll(/^export const (\w+)\s*=\s*createServerFn/mg)];

  if (declarations.length === 0) {
    console.error(\`[admin-rbac] No createServerFn exports found in \${module.file}\`);
    failures += 1;
    continue;
  }

  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index];
    const next = declarations[index + 1];
    const action = declaration[1];
    const block = source.slice(declaration.index, next?.index ?? source.length);
    checked += 1;

    if (!/\.middleware\(\s*\[\s*requireSupabaseAuth\s*\]\s*\)/s.test(block)) {
      console.error(\`[admin-rbac] \${module.file} :: \${action} is missing requireSupabaseAuth middleware\`);
      failures += 1;
    }

    if (!module.exceptions.has(action) &&
        !/\b(?:requireAdmin|requirePermission|requireAdminPermission)\s*\(/.test(block)) {
      console.error(\`[admin-rbac] \${module.file} :: \${action} is missing a server-side role/permission check\`);
      failures += 1;
    }

    if (action === "getAdminContext" &&
        (!/is_beboss_admin/.test(block) ||
         !/is_beboss_staff/.test(block) ||
         !/current_admin_permissions/.test(block))) {
      console.error("[admin-rbac] getAdminContext must check admin, staff and delegated permissions");
      failures += 1;
    }
  }
}

if (failures > 0) {
  console.error(\`[admin-rbac] Failed: \${failures} finding(s) across \${checked} server actions.\`);
  process.exit(1);
}

console.log(\`[admin-rbac] Passed: authentication and role/permission checks verified for \${checked} admin server actions.\`);
