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
  {
    file: "src/lib/insights.functions.ts",
    explicitChecks: {
      getShopInsights: [
        /requireAdminPermission\(ctx,\s*"analytics\.view"\)/,
        /requireAdminPermission\(ctx,\s*"shops\.view"\)/,
      ],
      getDatashareKeyStatus: [/requireStaffRole\(ctx,\s*true\)/],
      setDatashareKey: [/requireStaffRole\(ctx,\s*true\)/],
      getShopRecords: [/requireAdminPermission\(ctx,\s*"shops\.view"\)/],
    },
  },
  {
    file: "src/lib/ai.functions.ts",
    explicitChecks: {
      askCopilot: [
        /requireAdminPermission\(ctx,\s*"analytics\.view"\)/,
        /requireAdminPermission\(ctx,\s*"shops\.view"\)/,
      ],
      draftInboxReply: [/requireAdminPermission\(ctx,\s*"inbox\.manage"\)/],
    },
  },
];

let failures = 0;
let checked = 0;

function fail(message) {
  console.error("[admin-rbac] " + message);
  failures += 1;
}

for (const module of modules) {
  const source = readFileSync(module.file, "utf8");
  const declarations = [...source.matchAll(/^export const (\w+)\s*=\s*createServerFn/mg)];

  if (declarations.length === 0) {
    fail("No createServerFn exports found in " + module.file);
    continue;
  }

  const names = new Set(declarations.map((match) => match[1]));
  if (module.explicitChecks) {
    for (const action of Object.keys(module.explicitChecks)) {
      if (!names.has(action)) fail(module.file + " :: guard policy references missing action " + action);
    }
    for (const action of names) {
      if (!module.explicitChecks[action]) {
        fail(module.file + " :: " + action + " has no explicit least-privilege guard policy");
      }
    }
  }

  for (let index = 0; index < declarations.length; index += 1) {
    const declaration = declarations[index];
    const next = declarations[index + 1];
    const action = declaration[1];
    const block = source.slice(declaration.index, next?.index ?? source.length);
    checked += 1;

    if (!/\.middleware\(\s*\[\s*requireSupabaseAuth\s*\]\s*\)/s.test(block)) {
      fail(module.file + " :: " + action + " is missing requireSupabaseAuth middleware");
    }

    if (!module.exceptions?.has(action)) {
      const explicit = module.explicitChecks?.[action];
      if (explicit) {
        for (const pattern of explicit) {
          if (!pattern.test(block)) {
            fail(module.file + " :: " + action + " is missing required permission guard " + pattern);
          }
        }
      } else if (!/\\b(?:requireAdmin|requirePermission|requireAdminPermission)\\s*\\(/.test(block)) {
        fail(module.file + " :: " + action + " is missing a server-side role/permission check");
      }
    }

    if (action === "getAdminContext" &&
        (!/is_beboss_admin/.test(block) ||
         !/is_beboss_staff/.test(block) ||
         !/current_admin_permissions/.test(block))) {
      fail("getAdminContext must check admin, staff and delegated permissions");
    }
  }
}

if (failures > 0) {
  console.error("[admin-rbac] Failed: " + failures + " finding(s) across " + checked + " admin server actions.");
  process.exit(1);
}

console.log("[admin-rbac] Passed: authentication and least-privilege role/permission checks verified for " + checked + " admin server actions.");
