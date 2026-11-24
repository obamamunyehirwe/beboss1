import { copyFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const desktopRoot = path.resolve(import.meta.dirname, "..");
const webPublic = path.resolve(desktopRoot, "..", "web", "public");
const desktopPublic = path.join(desktopRoot, "public");

if (!existsSync(webPublic)) {
  throw new Error(`BeBoss web public assets were not found at ${webPublic}`);
}

await mkdir(desktopPublic, { recursive: true });
const entries = await readdir(webPublic, { withFileTypes: true });

for (const entry of entries) {
  if (!entry.isFile()) continue;
  if (path.extname(entry.name).toLowerCase() === ".svg") continue;
  await copyFile(path.join(webPublic, entry.name), path.join(desktopPublic, entry.name));
}

console.log(`Synced BeBoss raster assets from web/public to desktop/public`);
