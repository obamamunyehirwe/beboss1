import postgres from "postgres";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const productionProjectRef = "ahlpvlhmpfiyeoercxol";
const enabled = process.env.BEBOSS_RUN_SECURITY_INTEGRATION_TESTS === "1";
const databaseUrl = process.env.BEBOSS_TEST_DATABASE_URL ?? "";
const testProjectRef = process.env.BEBOSS_TEST_PROJECT_REF ?? "";

if (enabled && (!databaseUrl || !/^[a-z0-9]{20}$/.test(testProjectRef))) {
  throw new Error("Security integration tests require BEBOSS_TEST_DATABASE_URL and a 20-character BEBOSS_TEST_PROJECT_REF.");
}
if (enabled && (testProjectRef === productionProjectRef || databaseUrl.includes(productionProjectRef))) {
  throw new Error("Refusing to run destructive security integration fixtures against the BeBoss production Supabase project.");
}

let database: ReturnType<typeof postgres>;

function suffix(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

function shopFixture() {
  const idPart = suffix();
  const username = "sec" + idPart;
  const phone = "+25078" + idPart.slice(0, 7);
  const lastNine = phone.replace(/\D/g, "").slice(-9);
  return { id: username + "_" + lastNine, username, phone };
}

describe.skipIf(!enabled)("Supabase security concurrency integration", () => {
  beforeAll(() => {
    database = postgres(databaseUrl, {
      max: 16,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 5,
    });
  });

  afterAll(async () => {
    if (database) await database.end({ timeout: 5 });
  });

  it("isolates a tenant's shop-account rows from another tenant's header", async () => {
    const tenantA = shopFixture();
    const tenantB = shopFixture();

    await database.begin(async (tx) => {
      await tx.unsafe(
        "insert into public.shop_accounts (id, shop_name, owner_name, owner_username, owner_phone) values ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
        [tenantA.id, "Security fixture A", "Test A", tenantA.username, tenantA.phone, tenantB.id, "Security fixture B", "Test B", tenantB.username, tenantB.phone],
      );
      await tx.unsafe("set local role anon");
      await tx.unsafe("select set_config('request.headers', $1, true)", [
        JSON.stringify({ "x-shop-sync-key": tenantA.id }),
      ]);
      const visible = await tx.unsafe(
        "select id from public.shop_accounts where id = $1 or id = $2 order by id",
        [tenantA.id, tenantB.id],
      );
      expect(visible.map((row) => row.id)).toEqual([tenantA.id]);
      await tx.unsafe("reset role");
      await tx.unsafe("delete from public.shop_accounts where id = $1 or id = $2", [tenantA.id, tenantB.id]);
    });
  });

  it("removes administrator permission as soon as the user's role row is revoked", async () => {
    const userId = randomUUID();
    const email = "security-role-" + suffix() + "@example.invalid";

    await database.begin(async (tx) => {
      await tx.unsafe(
        "insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values ($1, 'authenticated', 'authenticated', $2, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)",
        [userId, email],
      );
      await tx.unsafe("insert into public.user_roles (user_id, role) values ($1, 'admin')", [userId]);
      await tx.unsafe("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await tx.unsafe("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
      await tx.unsafe("set local role authenticated");

      const beforeRows = await tx.unsafe("select public.is_beboss_admin() as allowed");
      await tx.unsafe("reset role");
      await tx.unsafe("delete from public.user_roles where user_id = $1", [userId]);
      await tx.unsafe("set local role authenticated");
      const afterRows = await tx.unsafe("select public.is_beboss_admin() as allowed");
      expect(beforeRows[0].allowed).toBe(true);
      expect(afterRows[0].allowed).toBe(false);
      await tx.unsafe("reset role");
      await tx.unsafe("delete from auth.users where id = $1", [userId]);
    });
  });

  it("allows only one different device to redeem a single-use invite under concurrent requests", async () => {
    const tenant = shopFixture();
    const deviceRecordId = "SEC-DEVICE-" + suffix();
    const codeHash = createHash("sha256").update(randomUUID()).digest("hex");
    const deviceA = "SEC-TERMINAL-A-" + suffix();
    const deviceB = "SEC-TERMINAL-B-" + suffix();

    await database.begin(async (tx) => {
      await tx.unsafe(
        "insert into public.shop_accounts (id, shop_name, owner_name, owner_username, owner_phone) values ($1, $2, $3, $4, $5)",
        [tenant.id, "Invite race fixture", "Test Owner", tenant.username, tenant.phone],
      );
      await tx.unsafe(
        "insert into public.shop_devices (id, shop_sync_key, device_name, device_id, assigned_user_id, assigned_username, assigned_user_name, role, branch_id, branch_name, is_active) values ($1, $2, $3, '', 'actor-fixture', 'actor-fixture', 'Actor fixture', 'CASHIER', 'main_branch', 'Main Store', true)",
        [deviceRecordId, tenant.id, "Invite race slot"],
      );
      await tx.unsafe(
        "insert into beboss_private.shop_device_invites (shop_sync_key, device_record_id, code_hash, created_by_device_id, created_by_user_id, assigned_user_id, branch_id, expires_at) values ($1, $2, $3, 'issuer-fixture', 'issuer-fixture', 'actor-fixture', 'main_branch', public.now_ms() + 3600000)",
        [tenant.id, deviceRecordId, codeHash],
      );
    });

    const redeem = (deviceId: string) => database.begin(async (tx) => {
      await tx.unsafe("select set_config('request.headers', $1, true)", [
        JSON.stringify({ "x-shop-sync-key": tenant.id }),
      ]);
      await tx.unsafe("set local role anon");
      const rows = await tx.unsafe(
        "select beboss_private.redeem_shop_device_invite($1, $2, $3, $4) as device",
        [tenant.id, codeHash, deviceId, "Integration test terminal"],
      );
      return rows[0].device;
    });

    try {
      const outcomes = await Promise.allSettled([redeem(deviceA), redeem(deviceB)]);
      expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
      const winnerRows = await database.unsafe(
        "select device_id from public.shop_devices where id = $1",
        [deviceRecordId],
      );
      expect([deviceA, deviceB]).toContain(winnerRows[0].device_id);
    } finally {
      await database.begin(async (tx) => {
        await tx.unsafe("delete from beboss_private.shop_device_invites where device_record_id = $1", [deviceRecordId]);
        await tx.unsafe("delete from public.shop_devices where id = $1", [deviceRecordId]);
        await tx.unsafe("delete from public.shop_accounts where id = $1", [tenant.id]);
      });
    }
  });

  it("allows only one concurrent payment approval compare-and-set winner", async () => {
    const requestId = "SEC-PAYMENT-" + suffix();
    const providerRef = "SEC-REF-" + suffix();

    await database.unsafe(
      "insert into public.payment_requests (id, shop_name, owner_username, owner_phone, status, ussd_code) values ($1, 'Payment race fixture', 'security-test-owner', '+250781234567', 'PENDING_VERIFICATION', $2)",
      [requestId, providerRef],
    );

    const approve = (admin: string) => database.unsafe(
      "update public.payment_requests set status = 'APPROVED', approval_mode = 'UNLOCK_CODE', generated_unlock_code = $2, verified_by_admin = $3, admin_verification_note = 'Verified against isolated provider fixture', updated_at = (extract(epoch from now()) * 1000)::bigint where id = $1 and status = 'PENDING_VERIFICATION' returning id",
      [requestId, "TEST-CODE-" + suffix(), admin],
    );

    try {
      const winners = await Promise.all([
        approve("security-test-admin-a"),
        approve("security-test-admin-b"),
      ]);
      expect(winners.reduce((total, rows) => total + rows.length, 0)).toBe(1);
      const finalRows = await database.unsafe(
        "select status from public.payment_requests where id = $1",
        [requestId],
      );
      expect(finalRows[0].status).toBe("APPROVED");
    } finally {
      await database.unsafe("delete from public.payment_requests where id = $1", [requestId]);
    }
  });

  it("caps simultaneous BB2 and contact calls at their configured allowances", async () => {
    for (const scope of ["legacy_bb2", "public_contact"] as const) {
      const keyHash = createHash("sha256").update(randomUUID()).digest("hex");
      try {
        const outcomes = await Promise.all(
          Array.from({ length: 32 }, () => database.unsafe(
            "select allowed, request_count from public.consume_rate_limit('" + scope + "', $1, 7, 900)",
            [keyHash],
          )),
        );
        const rows = outcomes.flat();
        expect(rows).toHaveLength(32);
        expect(rows.filter((row) => row.allowed)).toHaveLength(7);
        expect(rows.filter((row) => !row.allowed)).toHaveLength(25);
        expect(Math.max(...rows.map((row) => Number(row.request_count)))).toBe(32);
      } finally {
        await database.unsafe(
          "delete from beboss_private.rate_limit_buckets where scope = $1 and key_hash = $2",
          [scope, keyHash],
        );
      }
    }
  });
});
