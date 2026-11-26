import assert from "node:assert/strict";
import test from "node:test";
import { buildDesktopActionBody } from "./cloud-request.ts";

test("feature payload cannot override the requested action or authenticated owner identity", () => {
  const body = buildDesktopActionBody(
    "save_snapshot",
    { username: "registered-owner", phone: "+250788123456" },
    {
      action: "device_remove",
      username: "attacker",
      phone: "+250700000000",
      snapshot: { products: [] },
      requestId: "request-1",
    },
  );

  assert.deepEqual(body, {
    action: "save_snapshot",
    username: "registered-owner",
    phone: "+250788123456",
    snapshot: { products: [] },
    requestId: "request-1",
  });
});

test("ordinary payload fields remain available to the requested action", () => {
  const body = buildDesktopActionBody(
    "bootstrap",
    { username: "owner", phone: "+250788123456" },
    { deviceId: "desktop-1", deviceName: "BeBoss Desktop" },
  );

  assert.equal(body.action, "bootstrap");
  assert.equal(body.username, "owner");
  assert.equal(body.phone, "+250788123456");
  assert.equal(body.deviceId, "desktop-1");
  assert.equal(body.deviceName, "BeBoss Desktop");
});
