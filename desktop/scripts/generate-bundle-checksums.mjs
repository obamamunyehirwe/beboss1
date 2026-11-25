import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const bundleDirectory = process.argv[2];
if (!bundleDirectory) {
  throw new Error("Usage: node scripts/generate-bundle-checksums.mjs <bundle-directory>");
}

const absoluteDirectory = path.resolve(process.cwd(), bundleDirectory);
const entries = await readdir(absoluteDirectory, { withFileTypes: true });
const artifacts = entries
  .filter((entry) => entry.isFile() && entry.name !== "SHA256SUMS.txt")
  .map((entry) => entry.name)
  .sort();

if (artifacts.length === 0) {
  throw new Error(`No desktop packages were found in ${absoluteDirectory}`);
}

const lines = [];
for (const filename of artifacts) {
  const filePath = path.join(absoluteDirectory, filename);
  const fileStats = await stat(filePath);
  if (fileStats.size < 1024 * 1024) {
    throw new Error(`Desktop package is unexpectedly small: ${filename}`);
  }

  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  lines.push(`${hash.digest("hex")}  ${filename}`);
}

const manifest = lines.join("\n") + "\n";
await writeFile(path.join(absoluteDirectory, "SHA256SUMS.txt"), manifest, "utf8");
process.stdout.write(manifest);
