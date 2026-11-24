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
  assertEquals(await sha256Hex("beboss-test"), "6c0d6a57b03f3e4c9c5c3cce1b7ea5c790f86685f97d9679f8f9e1c5f838b98a");
});
