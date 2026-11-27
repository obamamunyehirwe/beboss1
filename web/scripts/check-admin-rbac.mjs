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
      } else if (!/\b(?:requireAdmin|requirePermission|requireAdminPermission)\s*\(/.test(block)) {
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

// Owner-portal server functions are a separate tenant boundary from platform admins.
// Authenticated mutations must establish the verified owner membership on every request;
// only the explicitly listed enrollment/public read/download endpoints may be anonymous.
const ownerPortalFile = "src/lib/public.functions.ts";
const ownerPortal = readFileSync(ownerPortalFile, "utf8");
const ownerDeclarations = [...ownerPortal.matchAll(/^export const (\w+)\s*=\s*createServerFn/mg)];
const publicActions = new Set([
  "requestMyShopOwnerOtp",
  "getPublicSite",
  "getPublicDesktopRelease",
  "createPublicDesktopDownload",
]);
const ownerScopedActions = new Set([
  "lookupMyShop",
  "addMyShopDevice",
  "upsertMyShopBranch",
  "deleteMyShopBranch",
  "upsertMyShopStockTransfer",
  "confirmMyShopStockTransfer",
  "requestMyShopStockTransferCancellation",
  "postMyShopFinanceEntry",
  "reverseMyShopFinanceEntry",
  "createGatewayCheckout",
  "checkGatewayPaymentStatus",
]);
if (ownerDeclarations.length === 0) fail(ownerPortalFile + " :: no server functions were found");
for (let index = 0; index < ownerDeclarations.length; index += 1) {
  const declaration = ownerDeclarations[index];
  const action = declaration[1];
  const block = ownerPortal.slice(declaration.index, ownerDeclarations[index + 1]?.index ?? ownerPortal.length);
  checked += 1;
  if (publicActions.has(action)) {
    if (/\.middleware\(\s*\[\s*requireSupabaseAuth\s*\]\s*\)/s.test(block)) {
      fail(ownerPortalFile + " :: public action " + action + " unexpectedly changes its documented authentication contract");
    }
    if (action === "requestMyShopOwnerOtp" &&
        (!/take_shop_owner_otp_slot/.test(block) ||
         !/owner_username/.test(block) ||
         !/owner_phone/.test(block))) {
      fail(ownerPortalFile + " :: requestMyShopOwnerOtp must verify the stored owner identity and rate-limit OTPs");
    }
    if (action === "createPublicDesktopDownload" &&
        (!/eq\("is_public",\s*true\)/.test(block) ||
         !/createSignedUrl/.test(block))) {
      fail(ownerPortalFile + " :: createPublicDesktopDownload must only sign downloads for public releases");
    }
    if (action === "getPublicDesktopRelease" && !/eq\("is_public",\s*true\)/.test(block)) {
      fail(ownerPortalFile + " :: getPublicDesktopRelease must return only public releases");
    }
    continue;
  }

  if (!/\.middleware\(\s*\[\s*requireSupabaseAuth\s*\]\s*\)/s.test(block)) {
    fail(ownerPortalFile + " :: " + action + " is missing authenticated-user middleware");
  }
  if (action === "claimMyShopOwner") {
    if (!/auth\.getUser/.test(block) ||
        !/phone_confirmed_at/.test(block) ||
        !/shop_owner_memberships/.test(block) ||
        !/status:\s*"ACTIVE"/.test(block)) {
      fail(ownerPortalFile + " :: claimMyShopOwner must verify the caller's confirmed owner phone and active shop membership");
    }
  } else if (ownerScopedActions.has(action)) {
    if (!/\b(?:requireOwnerTenantAdmin|requireOwnerSession)\s*\(/.test(block)) {
      fail(ownerPortalFile + " :: " + action + " is missing a verified tenant-owner membership check");
    }
  } else {
    fail(ownerPortalFile + " :: " + action + " is not classified by the owner-portal authorization audit");
  }
}

// The desktop/mobile Edge Function is the trusted boundary for remote management.
// Every non-device action must first pass requireOwner (confirmed owner phone + active
// shop-owner membership). Sensitive management mutations must then verify the
// enrolled desktop device against the exact active Room owner.
const edgeFile = "supabase/functions/beboss-desktop/index.ts";
const edgeSource = readFileSync(edgeFile, "utf8");
const ownerGuardIndex = edgeSource.indexOf("const owner = await requireOwner(");
const ownerGuardFunction = edgeSource.slice(
  edgeSource.indexOf("async function requireOwner("),
  edgeSource.indexOf("async function getShopDataShareSecret(")
);
if (ownerGuardIndex < 0 ||
    !/auth\\.getUser/.test(ownerGuardFunction) ||
    !/phone_confirmed_at/.test(ownerGuardFunction) ||
    !/normalizePhone\\(text\\(user\\.phone\\)\\)/.test(ownerGuardFunction) ||
    !/shop_owner_memberships/.test(ownerGuardFunction) ||
    !/status !== "ACTIVE"/.test(ownerGuardFunction) ||
    !/revoked_at/.test(ownerGuardFunction)) {
  fail(edgeFile + " :: shared owner boundary must validate the confirmed owner phone and active, non-revoked tenant membership");
}

const edgeDeviceActions = [
  "android_transfer_policy",
  "android_transfer_register_approval_key",
  "android_transfer_sync",
  "record_device_local_audit",
  "record_device_sync_audit",
  "record_device_branch_tombstones",
  "verify_device_branch_share",
];
const combinedAndroidStart = edgeSource.indexOf('if (action === "android_transfer_policy" ||');
const combinedAndroidEnd = edgeSource.indexOf('if (action === "record_device_local_audit")', combinedAndroidStart);
const combinedAndroidBlock = combinedAndroidStart >= 0 && combinedAndroidEnd > combinedAndroidStart
  ? edgeSource.slice(combinedAndroidStart, combinedAndroidEnd)
  : "";
if (!/X-BeBoss-Device-ID/.test(combinedAndroidBlock) ||
    !/X-BeBoss-Device-Token/.test(combinedAndroidBlock) ||
    !/deviceClient/.test(combinedAndroidBlock) ||
    !/remote_kill_switch/.test(combinedAndroidBlock) ||
    !/is_active/.test(combinedAndroidBlock)) {
  fail(edgeFile + " :: Android transfer policy, key registration and sync must validate an active device credential and shop");
}
for (const action of edgeDeviceActions.slice(3)) {
  const start = edgeSource.indexOf('if (action === "' + action + '")');
  const next = edgeSource.indexOf('if (action === "', start + 1);
  const block = start >= 0 ? edgeSource.slice(start, next > start ? next : edgeSource.length) : "";
  if (!/X-BeBoss-Device-ID/.test(block) ||
      !/X-BeBoss-Device-Token/.test(block) ||
      !/deviceClient/.test(block) ||
      !/remote_kill_switch/.test(block)) {
    fail(edgeFile + " :: " + action + " must validate an active enrolled-device credential and shop");
  }
}

const ownerEdgeActions = [
  "lan_pairing_credentials",
  "restore_preview",
  "redeem_unlock_code",
  "device_enroll",
  "device_retire_legacy",
  "bootstrap",
  "register_desktop",
  "management_refresh",
  "management_probe",
  "create_branch_share",
  "verify_branch_share",
  "create_checkout",
  "submit_payment_proof",
];
for (const action of ownerEdgeActions) {
  const start = edgeSource.indexOf('if (action === "' + action + '"');
  if (start < 0) {
    // bootstrap is grouped with register_desktop in one action branch.
    if (action === "bootstrap" && edgeSource.includes('action === "bootstrap" || action === "register_desktop"')) continue;
    fail(edgeFile + " :: expected owner-protected action " + action + " is missing");
  } else if (start < ownerGuardIndex) {
    fail(edgeFile + " :: " + action + " is handled before the shared confirmed-owner membership gate");
  }
}

const sensitiveEdgeMutations = [
  "save_snapshot",
  "approval_policy_save",
  "finance_ledger_post",
  "finance_ledger_reverse",
  "branch_upsert",
  "branch_delete",
  "branch_reconcile",
  "staff_update",
  "transfer_create",
  "transfer_command",
  "device_create",
  "device_update",
  "device_set_active",
  "device_remove",
  "device_reinvite",
];
for (const action of sensitiveEdgeMutations) {
  const start = edgeSource.indexOf('if (action === "' + action + '")');
  const next = edgeSource.indexOf('if (action === "', start + 1);
  const block = start >= 0 ? edgeSource.slice(start, next > start ? next : edgeSource.length) : "";
  if (start < 0 || !/ownerManagementActorV2\\s*\\(/.test(block)) {
    fail(edgeFile + " :: sensitive management mutation " + action + " must verify an active owner-assigned device");
  }
}
checked += edgeDeviceActions.length + ownerEdgeActions.length + sensitiveEdgeMutations.length + 1;

// The platform stats endpoint is intentionally public and read-only.
const platformFile = "src/lib/platform.functions.ts";
const platformSource = readFileSync(platformFile, "utf8");
const platformDeclarations = [...platformSource.matchAll(/^export const (\w+)\s*=\s*createServerFn/mg)];
if (platformDeclarations.length !== 1 || platformDeclarations[0]?.[1] !== "getPlatformStats") {
  fail(platformFile + " :: unexpected public platform server-function surface");
} else {
  const block = platformSource.slice(platformDeclarations[0].index);
  if (!/createPublicClient|public_platform_stats/.test(block) ||
      /\.from\([^)]*\)\.(?:insert|update|upsert|delete)\(/s.test(block)) {
    fail(platformFile + " :: getPlatformStats must remain a public read-only projection");
  }
  checked += 1;
}

if (failures > 0) {
  console.error("[admin-rbac] Failed: " + failures + " finding(s) across " + checked + " admin server actions.");
  process.exit(1);
}

console.log("[admin-rbac] Passed: authentication and least-privilege role/permission checks verified for " + checked + " admin server actions.");
