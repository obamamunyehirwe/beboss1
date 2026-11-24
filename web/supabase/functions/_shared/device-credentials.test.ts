import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  createDeviceToken,
  DEVICE_ACCESS_TTL_MS,
  DEVICE_REFRESH_TTL_MS,
  isDeviceToken,
  sha256Hex,
} from "./device-credentials.ts";

Deno.test("device tokens contain 256 bits of lowercase hex material", () => {
  const first = createDeviceToken();
  const second = createDeviceToken();
  assert(isDeviceToken(first));
  assert(isDeviceToken(second));
  assertNotEquals(first, second);
  assertEquals(first.length, 64);
});

Deno.test("device token validation rejects malformed and truncated material", () => {
  assertEquals(isDeviceToken("a".repeat(64)), true);
  assertEquals(isDeviceToken("A".repeat(64)), false);
  assertEquals(isDeviceToken("a".repeat(63)), false);
  assertEquals(isDeviceToken("a".repeat(65)), false);
  assertEquals(isDeviceToken(""), false);
  assertEquals(isDeviceToken(null), false);
});

Deno.test("credential lifetimes are bounded", () => {
  assertEquals(DEVICE_ACCESS_TTL_MS, 86_400_000);
  assertEquals(DEVICE_REFRESH_TTL_MS, 7_776_000_000);
});

Deno.test("refresh material is only stored as a SHA-256 digest", async () => {
  assertEquals(await sha256Hex("beboss-test"), "eff63730e6c5a101028a3e74a9adac59e9f7963f4e21ba8bb200829c638c8773");
});
