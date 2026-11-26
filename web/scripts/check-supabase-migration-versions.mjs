#!/usr/bin/env node
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const entries = await readdir(directory, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();

if (files.length === 0) {
  throw new Error("No Supabase SQL migration files were found in " + directory);
}

const seen = new Map();
const problems = [];

for (const file of files) {
  const match = /^(\\d{14})_(.+)\\.sql$/.exec(file);
  if (!match) {
    problems.push(file + " must use the <14-digit timestamp>_<name>.sql format");
    continue;
  }

  const version = match[1];
  const previous = seen.get(version);
  if (previous) {
    problems.push("Duplicate migration version " + version + ": " + previous + " and " + file);
  } else {
    seen.set(version, file);
  }
}

if (problems.length > 0) {
  console.error("[supabase-migrations] Invalid migration history:");
  for (const problem of problems) console.error(" - " + problem);
  process.exit(1);
}

console.log("[supabase-migrations] Validated " + files.length + " migration files; all versions are unique.");
