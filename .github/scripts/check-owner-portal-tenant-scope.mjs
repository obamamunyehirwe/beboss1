#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const source = read("web/src/lib/public.functions.ts");
const serverClient = read("web/src/lib/owner-tenant.server.ts");
const migration = read("web/supabase/migrations/20261126123000_server_owner_portal_invite_context.sql");
const sqlTest = read("web/supabase/tests/android_device_credentials.sql");

const failures = [];
function fail(message) {
  failures.push(message);
}

function actionBlock(name) {
  const start = source.indexOf("export const " + name + " = createServerFn");
  if (start < 0) {
    fail("Missing owner portal server action: " + name);
    return "";
  }
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

const helperStart = source.indexOf("async function requireOwnerTenantAdmin(");
const helperEnd = source.indexOf("\nconst ownerEnrollmentSchema", helperStart);
const helper = helperStart >= 0 && helperEnd > helperStart
  ? source.slice(helperStart, helperEnd)
  : "";

if (!helper.includes("requireOwnerSession(context, username, phone)")) {
  fail("The service client must be created only after the caller's verified owner session.");
}
if (!helper.includes('createShopAdminClient(key)') || !helper.includes('.eq("id", key)')) {
  fail("The server client must be bound to the exact verified shop account.");
}
if (!helper.includes("normalizePhoneLast9") || !helper.includes("owner_username")) {
  fail("The helper must re-check registered owner username and phone against the shop record.");
}
if (!/headers:\s*\{\s*["']X-Shop-Sync-Key["']:\s*tenantKey\s*,?\s*\}/.test(serverClient)) {
  fail("The tenant header must be isolated in a newly-created per-request client.");
}
if (!serverClient.includes("resolveSupabaseSecretKey(process.env)")) {
  fail("The per-tenant client must use the configured Supabase secret-key resolver.");
}

const protectedActions = [
  "lookupMyShop",
  "addMyShopDevice",
  "upsertMyShopBranch",
  "deleteMyShopBranch",
  "upsertMyShopStockTransfer",
  "confirmMyShopStockTransfer",
  "requestMyShopStockTransferCancellation",
];
for (const name of protectedActions) {
  const block = actionBlock(name);
  if (!block.includes("requireOwnerTenantAdmin(ownerContext, data.username, data.phone)")) {
    fail(name + " must pass through verified owner membership and tenant client creation.");
  }
  if (block.includes("ownerContext.supabase")) {
    fail(name + " must not use the header-less caller client for tenant table operations.");
  }
  if (!block.includes(".eq(\"shop_sync_key\", key)") && name !== "lookupMyShop") {
    fail(name + " is missing an explicit shop_sync_key predicate.");
  }
}

const lookup = actionBlock("lookupMyShop");
for (const pattern of [
  /\.eq\("owner_username",\s*String\(registeredShop\.owner_username\)\)/,
  /\.eq\("owner_phone",\s*String\(registeredShop\.owner_phone\)\)/,
  /\.eq\("shop_username",\s*String\(registeredShop\.owner_username\)\)/,
  /\.eq\("shop_phone",\s*String\(registeredShop\.owner_phone\)\)/,
  /\.eq\("target_shop_key",\s*key\)/,
  /\.eq\("target_shop_key",\s*""\)/,
  /lan_sync_secret:\s*_shopSecret/,
]) {
  if (!pattern.test(lookup)) fail("lookupMyShop is missing required owner/tenant data protection: " + pattern);
}
if (!/registeredShop\.owner_phone/.test(lookup)) {
  fail("The owner dashboard must validate its shop against the registered owner phone.");
}

const branchUpsert = actionBlock("upsertMyShopBranch");
if (!branchUpsert.includes("existing.shop_sync_key !== key") ||
    !branchUpsert.includes('.eq("id", data.id).eq("shop_sync_key", key)')) {
  fail("Branch upsert must reject a branch ID owned by another shop.");
}

const branchDelete = actionBlock("deleteMyShopBranch");
if (!branchDelete.includes("branch.is_main_branch") ||
    !branchDelete.includes('from("shop_devices")') ||
    !branchDelete.includes('from("shop_users")')) {
  fail("Branch deletion must protect the main branch and active device/staff assignments.");
}

const transfer = actionBlock("upsertMyShopStockTransfer");
if (!transfer.includes('.eq("shop_sync_key", key).eq("is_active", true)') ||
    !transfer.includes("sourceBranch.name") ||
    !transfer.includes("targetBranch.name")) {
  fail("Transfer creation must validate both active tenant branches and use server-owned branch names.");
}

const receipt = actionBlock("confirmMyShopStockTransfer");
const cancel = actionBlock("requestMyShopStockTransferCancellation");
if (!receipt.includes('.eq("shop_sync_key", key)') || !receipt.includes('.eq("status", "IN_TRANSIT")')) {
  fail("Transfer receipt requests must use tenant scope and a valid state transition.");
}
if (!cancel.includes('.eq("shop_sync_key", key)') || !cancel.includes('.eq("status", "IN_TRANSIT")')) {
  fail("Transfer cancellation requests must use tenant scope and a valid state transition.");
}

if (!migration.includes("auth.jwt() ->> 'role', '') = 'service_role'") ||
    !migration.includes("s.legacy_sync_disabled = false")) {
  fail("Only service_role may resolve a legacy tenant header after retirement; anon/authenticated clients must remain blocked.");
}
if (!migration.includes("grant execute on function public.issue_shop_device_invite") ||
    !migration.includes("grant execute on function public.revoke_shop_device_invites")) {
  fail("Server-only device invitation RPC permissions are incomplete.");
}
if (!sqlTest.includes("trusted server-side owner-portal tenant context did not resolve") ||
    !sqlTest.includes('select set_config(\'request.jwt.claims\', \'{"role":"anon"}\', true)')) {
  fail("Database tests must cover server-only post-cutover access and anonymous legacy rejection.");
}

if (failures.length) {
  for (const failure of failures) console.error("[owner-portal-tenant-scope] " + failure);
  process.exit(1);
}
console.log("[owner-portal-tenant-scope] Passed: " + protectedActions.length +
  " owner actions enforce verified membership, isolated tenant clients and scoped access.");
