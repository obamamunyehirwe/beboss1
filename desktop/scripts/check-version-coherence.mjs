import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
function readJson(path) {
  try { return JSON.parse(readFileSync(resolve(root, path), "utf8")); }
  catch (error) { throw new Error(`Unable to read ${path}: ${error.message}`); }
}
function readCargoVersion(path) {
  const source = readFileSync(resolve(root, path), "utf8");
  const match = /^version\s*=\s*"([^"]+)"\s*$/m.exec(source);
  if (!match) throw new Error(`Could not read package version from ${path}`);
  return match[1];
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauri = readJson("src-tauri/tauri.conf.json");
const versions = {
  "package.json": packageJson.version,
  "package-lock.json": packageLock.packages?.[""]?.version,
  "tauri.conf.json": tauri.version,
  "Cargo.toml": readCargoVersion("src-tauri/Cargo.toml"),
  "Cargo.lock": readCargoVersion("src-tauri/Cargo.lock")
};
const invalid = Object.entries(versions).filter(([, version]) => !version);
if (invalid.length) throw new Error(`Missing desktop versions: ${invalid.map(([name]) => name).join(", ")}`);

const unique = [...new Set(Object.values(versions))];
if (unique.length !== 1) {
  throw new Error("Desktop release versions are inconsistent:\n" +
    Object.entries(versions).map(([name, version]) => `  ${name}: ${version}`).join("\n"));
}

if (tauri.mainBinaryName !== "BeBoss") {
  throw new Error("tauri.conf.json must explicitly name the native executable BeBoss so the NSIS shortcuts and installer launch target resolve consistently.");
}

console.log(`BeBoss native desktop versions are coherent: ${unique[0]}`);
