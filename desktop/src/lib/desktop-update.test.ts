import test from "node:test";
import assert from "node:assert/strict";
import { compareDesktopVersions, parseDesktopUpdateOffer } from "./desktop-update.ts";

test("desktop versions use numeric semantic ordering and prerelease precedence", () => {
  assert.equal(compareDesktopVersions("1.10.0", "1.9.9"), 1);
  assert.equal(compareDesktopVersions("1.5.0", "1.5.0-rc.1"), 1);
  assert.equal(compareDesktopVersions("1.5.0-beta.2", "1.5.0-beta.10"), -1);
  assert.equal(compareDesktopVersions("1.4.2", "1.4.2"), 0);
  assert.equal(compareDesktopVersions("bad", "1.4.2"), null);
});

test("desktop update metadata accepts only newer same-platform official installers", () => {
  const id = "2f9d4de0-a015-48ea-baa2-c61edb5dca72";
  const offer = {
    id,
    platform: "windows",
    version: "1.4.3",
    fileName: "BeBoss-1.4.3-setup.exe",
    sizeBytes: 4_000_000,
    sha256: "a".repeat(64),
    releaseNotes: "Reliability improvements",
    publishedAt: "2026-11-27T00:00:00Z",
    downloadUrl: "https://beboss.rw/api/public/desktop-release/download?id=" + id,
  };
  assert.equal(parseDesktopUpdateOffer(offer, "1.4.2", "windows")?.version, "1.4.3");
  assert.equal(parseDesktopUpdateOffer({ ...offer, version: "1.4.2" }, "1.4.2", "windows"), null);
  assert.throws(() => parseDesktopUpdateOffer({ ...offer, platform: "macos" }, "1.4.2", "windows"));
  assert.throws(() => parseDesktopUpdateOffer({ ...offer, downloadUrl: "https://evil.example/update.exe" }, "1.4.2", "windows"));
  assert.throws(() => parseDesktopUpdateOffer({ ...offer, sha256: "bad" }, "1.4.2", "windows"));
  assert.throws(() => parseDesktopUpdateOffer({ ...offer, fileName: "..\\\\malicious.exe" }, "1.4.2", "windows"));
});
