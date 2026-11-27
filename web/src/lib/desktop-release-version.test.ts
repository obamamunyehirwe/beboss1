import { describe, expect, it } from "vitest";
import { compareReleaseVersions } from "./desktop-release-version";

describe("desktop release version ordering", () => {
  it("orders numeric releases without lexicographic mistakes", () => {
    expect(compareReleaseVersions("1.10.0", "1.9.9")).toBe(1);
    expect(compareReleaseVersions("1.4.2", "1.4.3")).toBe(-1);
    expect(compareReleaseVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("orders prereleases below stable versions", () => {
    expect(compareReleaseVersions("1.5.0", "1.5.0-rc.1")).toBe(1);
    expect(compareReleaseVersions("1.5.0-beta.2", "1.5.0-beta.10")).toBe(-1);
    expect(compareReleaseVersions("1.5.0-alpha", "1.5.0-beta")).toBe(-1);
  });

  it("rejects malformed release versions", () => {
    expect(compareReleaseVersions("latest", "1.4.2")).toBeNull();
    expect(compareReleaseVersions("1.4", "1.4.2")).toBeNull();
    expect(compareReleaseVersions("1.4.2-", "1.4.2")).toBeNull();
  });
});
