import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeSupabaseApiKey, resolveSupabaseSecretKey } from "./api-key";

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

describe("resolveSupabaseSecretKey", () => {
  const newSecret = "sb_secret_abcdefghijklmnopqrstuvwxyz0123456789-_";
  const legacySecret = "eyJhbGciOiJIUzI1NiJ9.legacy-service-role-key";

  it("prefers the current SUPABASE_SECRET_KEY variable", () => {
    expect(resolveSupabaseSecretKey({
      SUPABASE_SECRET_KEY: newSecret,
      SUPABASE_SERVICE_ROLE_KEY: legacySecret,
    })).toBe(newSecret);
  });

  it("continues to accept the legacy service-role variable", () => {
    expect(resolveSupabaseSecretKey({
      SUPABASE_SERVICE_ROLE_KEY: legacySecret,
    })).toBe(legacySecret);
  });

  it("returns undefined when neither server credential is configured", () => {
    expect(resolveSupabaseSecretKey({})).toBeUndefined();
  });

  it("reports the name of the configured key when its value is invalid", () => {
    expect(() => resolveSupabaseSecretKey({
      SUPABASE_SECRET_KEY: "not-a-valid-key\u0001",
      SUPABASE_SERVICE_ROLE_KEY: legacySecret,
    })).toThrow("SUPABASE_SECRET_KEY is not a valid Supabase API key");
  });
});
