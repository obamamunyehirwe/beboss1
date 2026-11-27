import assert from "node:assert/strict";
import test from "node:test";
import { resolveDesktopNavigationShortcut } from "./desktop-keyboard-shortcuts.ts";

test("desktop quick navigation maps the five primary workflows", () => {
  assert.equal(resolveDesktopNavigationShortcut("1", true, false, false), "overview");
  assert.equal(resolveDesktopNavigationShortcut("2", true, false, false), "checkout");
  assert.equal(resolveDesktopNavigationShortcut("3", true, false, false), "products");
  assert.equal(resolveDesktopNavigationShortcut("4", true, false, false), "sales");
  assert.equal(resolveDesktopNavigationShortcut("5", true, false, false), "reports");
});

test("desktop shortcuts never intercept typing or shifted combinations", () => {
  assert.equal(resolveDesktopNavigationShortcut("3", true, false, true), null);
  assert.equal(resolveDesktopNavigationShortcut("3", true, true, false), null);
  assert.equal(resolveDesktopNavigationShortcut("3", false, false, false), null);
  assert.equal(resolveDesktopNavigationShortcut("9", true, false, false), null);
});
