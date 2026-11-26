import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DOWNLOAD_PATH } from "./download-path";

describe("public APK download path", () => {
  it("is a stable same-origin endpoint path", () => {
    expect(DOWNLOAD_PATH).toBe("/api/public/download/latest");
    expect(DOWNLOAD_PATH.startsWith("/")).toBe(true);
    expect(DOWNLOAD_PATH).not.toMatch(/^https?:/i);
  });

  it("is imported explicitly by the admin release route", async () => {
    const route = await readFile(
      new URL("../routes/_authenticated/admin/releases.tsx", import.meta.url),
      "utf8",
    );
    expect(route).toMatch(/import\s+\{\s*DOWNLOAD_PATH\s*\}\s+from\s+["']@\/lib\/download-path["'];/);
  });
});
