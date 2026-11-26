import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSupabaseApiKey } from "./api-key";

describe("normalizeSupabaseApiKey", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves a valid opaque Supabase key", () => {
    const key = "sb_secret_abcdefghijklmnopqrstuvwxyz0123456789-_";
    expect(normalizeSupabaseApiKey(key, "SUPABASE_SERVICE_ROLE_KEY")).toBe(key);
  });

  it("removes pasted spaces and line breaks before the key becomes a header", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const key = "sb_secret_abcdefghijklmnopqrstuvwxyz0123456789-_";
    expect(
      normalizeSupabaseApiKey("  sb_secret_abcdefghijklmnopqrstuvwxyz 0123456789-_\n", "SUPABASE_SERVICE_ROLE_KEY"),
    ).toBe(key);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"));
    expect(warn.mock.calls.flat().join(" ")).not.toContain(key);
  });

  it("rejects an empty key", () => {
    expect(() => normalizeSupabaseApiKey(" \n\t ", "SUPABASE_SERVICE_ROLE_KEY"))
      .toThrow("SUPABASE_SERVICE_ROLE_KEY is not a valid Supabase API key");
  });

  it("rejects non-printable and non-ASCII characters", () => {
    expect(() => normalizeSupabaseApiKey("sb_secret_bad\u0001value", "SUPABASE_SERVICE_ROLE_KEY"))
      .toThrow("SUPABASE_SERVICE_ROLE_KEY is not a valid Supabase API key");
    expect(() => normalizeSupabaseApiKey("sb_secret_clé", "SUPABASE_SERVICE_ROLE_KEY"))
      .toThrow("SUPABASE_SERVICE_ROLE_KEY is not a valid Supabase API key");
  });
});
