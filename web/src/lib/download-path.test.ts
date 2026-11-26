import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DOWNLOAD_PATH } from "./download-path";

describe("public APK download path", () => {
  it("is a stable same-origin endpoint path", () => {
    expect(DOWNLOAD_PATH).toBe("/api/public/download/latest");
    expect(DOWNLOAD_PATH.startsWith("/")).toBe(true);
    expect(DOWNLOAD_PATH).not.toMatch(/^https?:/i);
  });

  it.each(["releases.tsx", "settings.tsx"])(
    "is imported explicitly by the admin %s route",
    (file) => {
      const route = readFileSync(
        resolve(process.cwd(), "src/routes/_authenticated/admin", file),
        "utf8",
      );
      expect(route).toMatch(
        /import\s+\{\s*DOWNLOAD_PATH\s*\}\s+from\s+["']@\/lib\/download-path["'];/,
      );
      expect(route).not.toMatch(/(?:^|[^\w])DOWNLOAD_PATH\s*=/m);
    },
  );

  it("keeps the stale admin bundle recovery path visible", () => {
    const route = readFileSync(
      resolve(process.cwd(), "src/routes/_authenticated/admin/route.tsx"),
      "utf8",
    );
    expect(route).toContain("DOWNLOAD_PATH is not defined");
    expect(route).toMatch(/location\.reload\(\)|window\.location\.reload\(\)/);
  });
});
