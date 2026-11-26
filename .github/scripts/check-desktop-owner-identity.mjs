#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(resolve(root, "web/supabase/functions/beboss-desktop/index.ts"), "utf8");
const start = source.indexOf("async function ownerManagementActorV2(");
const end = source.indexOf("\nfunction validatedJwtAuthTimeSeconds", start);

if (start < 0 || end < 0) {
  throw new Error("[desktop-owner-identity] Could not locate ownerManagementActorV2.");
}

const helper = source.slice(start, end);
const failures = [];

if (!/ownerManagementActorV2\([^)]*ownerUsername:\s*string\)/.test(helper)) {
  failures.push("The helper must accept the verified shop-owner username, not the Supabase Auth UUID.");
}
if (!/\.eq\("shop_sync_key",\s*shopId\)/.test(helper) ||
    !/\.eq\("username",\s*normalizedOwnerUsername\)/.test(helper) ||
    !/\.eq\("role",\s*"OWNER"\)/.test(helper) ||
    !/\.eq\("is_active",\s*true\)/.test(helper)) {
  failures.push("The shop owner lookup must be tenant-scoped, username-bound, active and OWNER-only.");
}
if (!/text\(actorDevice\.data\.assigned_user_id\)\s*!==\s*text\(ownerUser\.data\.user_id\)/.test(helper)) {
  failures.push("The registered desktop must be checked against the resolved Room owner user_id.");
}
if (/ownerUserId|owner\.user\.id/.test(helper)) {
  failures.push("Supabase Auth UUIDs must not be compared directly with shop_users.user_id.");
}

const calls = source.match(/ownerManagementActorV2\(admin,\s*owner\.shopId,[^\n]*\)/g) ?? [];
if (calls.length === 0 || calls.some((call) => !/owner\.username\)/.test(call))) {
  failures.push("Every management action must pass the username from the verified owner membership.");
}

if (failures.length) {
  for (const failure of failures) console.error("[desktop-owner-identity] " + failure);
  process.exit(1);
}

console.log("[desktop-owner-identity] Passed: all " + calls.length + " desktop-management call sites resolve the Room owner identity through the verified tenant username.");
