import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_COPY_KEYS } from "./admin-copy";

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(tsx|ts)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("Admin multilingual copy coverage", () => {
  it("has a Kinyarwanda, French and Kiswahili entry for every static Admin copy key", () => {
    const dictionary = new Set(ADMIN_COPY_KEYS);
    const roots = [
      join(process.cwd(), "src/routes/_authenticated/admin"),
      join(process.cwd(), "src/components/admin"),
    ];
    const files = roots.flatMap(collectSourceFiles);
    const callPattern = /\ba\(\s*(["'])([^"'\n]+)\1\s*\)/g;
    const missing = new Map<string, string[]>();

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      let match: RegExpExecArray | null;
      while ((match = callPattern.exec(source)) !== null) {
        const key = match[2];
        if (!dictionary.has(key)) {
          const relativePath = file.replace(process.cwd() + "/", "");
          const locations = missing.get(key) ?? [];
          locations.push(relativePath);
          missing.set(key, locations);
        }
      }
    }

    expect(
      [...missing.entries()].map(([key, filesForKey]) => ({
        key,
        files: [...new Set(filesForKey)].sort(),
      })),
    ).toEqual([]);
  });
});
