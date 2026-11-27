import {
  buildShopAuditSnapshot,
  classifyShopAuditTransition,
  parseShopAuditSnapshot
} from "./shop-audit.ts";
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

Deno.test("branch creation and profile/status/manager changes produce distinct audit actions", () => {
  const created = buildShopAuditSnapshot("BRANCH", {
    id: "branch-1", name: "Kigali Central", code: "KG-01", is_active: true,
    is_main_branch: true, operational_status: "OPEN", created_at: 100, updated_at: 100
  });
  const first = classifyShopAuditTransition("BRANCH", null, created);
  assertEquals(first?.action, "CREATED");

  const updated = buildShopAuditSnapshot("BRANCH", {
    id: "branch-1", name: "Kigali Central", code: "KG-01", is_active: true,
    is_main_branch: true, operational_status: "SUSPENDED",
    manager_user_id: "manager-1", manager_name: "Branch Manager", notes: "Extended opening hours",
    created_at: 100, updated_at: 200
  });
  const status = classifyShopAuditTransition("BRANCH", created, updated);
  assertEquals(status?.action, "OPERATING_STATUS_CHANGED");
  assert(status?.detail.includes("branch manager changed"));

  const restored = { ...updated, isActive: true };
  const deactivated = { ...restored, isActive: false, updatedAt: 300 };
  assertEquals(classifyShopAuditTransition("BRANCH", restored, deactivated)?.action, "DEACTIVATED");
});

Deno.test("branch main-branch reassignment is audited and unchanged syncs are idempotent", () => {
  const old = buildShopAuditSnapshot("BRANCH", {
    id: "branch-2", name: "Store 2", code: "BR-02", is_active: true,
    is_main_branch: false, operational_status: "OPEN", created_at: 100, updated_at: 100
  });
  const next = { ...old, isMainBranch: true, updatedAt: 200, hlcTimestamp: 200 };
  assertEquals(classifyShopAuditTransition("BRANCH", old, next)?.action, "MAIN_BRANCH_CHANGED");
  assertEquals(classifyShopAuditTransition("BRANCH", next, { ...next, updatedAt: 300, hlcTimestamp: 300 }), null);
});

Deno.test("changing a location from store to warehouse is a branch profile audit event", () => {
  const before = buildShopAuditSnapshot("BRANCH", {
    id: "location-type-1", name: "Central Depot", code: "DEP-01", location_type: "STORE",
    is_active: true, operational_status: "OPEN", created_at: 100, updated_at: 100
  });
  const after = { ...before, locationType: "WAREHOUSE", updatedAt: 200, hlcTimestamp: 200 };
  const change = classifyShopAuditTransition("BRANCH", before, after);
  assertEquals(change?.action, "PROFILE_UPDATED");
  assert(change?.detail.includes("branch profile updated"));
});

Deno.test("branch notes are included in profile audit transitions", () => {
  const before = buildShopAuditSnapshot("BRANCH", {
    id: "branch-notes", name: "Warehouse", code: "WH-01", is_active: true,
    operational_status: "OPEN", notes: "Weekday hours", created_at: 100, updated_at: 100
  });
  const after = { ...before, notes: "Open every day", updatedAt: 200, hlcTimestamp: 200 };
  const change = classifyShopAuditTransition("BRANCH", before, after);
  assertEquals(change?.action, "PROFILE_UPDATED");
  assert(change?.detail.includes("branch profile updated"));
});

Deno.test("transfer state and receipt changes are tracked without changing the persisted row", () => {
  const before = buildShopAuditSnapshot("STOCK_TRANSFER", {
    id: "transfer-1", transfer_number: "TRF-1", status: "IN_TRANSIT",
    product_name: "Product", from_branch_name: "A", to_branch_name: "B",
    quantity: 4, cost_value_rwf: 4000, notes: "Urgent replenishment", created_at: 100, updated_at: 150
  });
  const after = {
    ...before, status: "COMPLETED", receivedBy: "manager", receivedAt: 200,
    updatedAt: 200, hlcTimestamp: 200
  };
  const change = classifyShopAuditTransition("STOCK_TRANSFER", before, after);
  assertEquals(change?.action, "STATUS_CHANGED");
  assert(change?.detail.includes("receipt confirmation changed"));
  const noteEdit = { ...after, notes: "Received in two sealed cartons" };
  const noteChange = classifyShopAuditTransition("STOCK_TRANSFER", after, noteEdit);
  assertEquals(noteChange?.action, "DETAILS_UPDATED");
  assert(noteChange?.detail.includes("notes changed"));
});

Deno.test("audit snapshots parse only matching versioned record details", () => {
  const snapshot = buildShopAuditSnapshot("BRANCH", {
    id: "branch-3", name: "Branch", code: "BR-03", is_active: true, created_at: 100, updated_at: 100
  });
  const event = classifyShopAuditTransition("BRANCH", null, snapshot);
  assert(event);
  assert(parseShopAuditSnapshot(event.detail, "branch-3"));
  assertEquals(parseShopAuditSnapshot(event.detail, "branch-other"), null);
  assertEquals(parseShopAuditSnapshot("old free-text audit", "branch-3"), null);
  assertNotEquals(snapshot.recordId, "");
});
