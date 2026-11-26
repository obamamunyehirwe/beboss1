import { describe, expect, it } from "vitest";
import { buildDownloadHref, detectDesktopOS } from "./download-routing";

describe("BeBoss download routing", () => {
  it("keeps the Android app on its stable download route", () => {
    expect(buildDownloadHref("mobile")).toBe("/download");
  });

  it.each(["windows", "macos", "linux"] as const)(
    "creates a shareable desktop route for %s",
    (os) => {
      expect(buildDownloadHref("desktop", os)).toBe(`/download?platform=desktop&os=${os}`);
    },
  );

  it("detects macOS, Windows and desktop Linux user agents", () => {
    expect(detectDesktopOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("macos");
    expect(detectDesktopOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectDesktopOS("Mozilla/5.0 (X11; Ubuntu; Linux x86_64)")).toBe("linux");
  });

  it("does not classify Android browsers as desktop Linux", () => {
    expect(detectDesktopOS("Mozilla/5.0 (Linux; Android 15; Pixel)")).toBe("windows");
  });
});
