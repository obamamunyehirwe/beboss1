import { describe, expect, it } from "vitest";
import { DOWNLOAD_PATH } from "./download-path";

describe("public APK download path", () => {
  it("is a stable same-origin endpoint path", () => {
    expect(DOWNLOAD_PATH).toBe("/api/public/download/latest");
    expect(DOWNLOAD_PATH.startsWith("/")).toBe(true);
    expect(DOWNLOAD_PATH).not.toMatch(/^https?:/i);
  });
});
