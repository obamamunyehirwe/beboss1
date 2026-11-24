import { readFileSync, writeFileSync } from "node:fs";

const p = "src/styles.css";
const buf = readFileSync(p);
const txt = buf.toString("latin1"); // 1:1 byte <-> char mapping preserves original UTF-8 bytes
const m = txt.indexOf("FIRST-RUN SETUP WIZARD");
if (m < 0) {
  console.log("marker not found; no change");
  process.exit(0);
}
const c = txt.lastIndexOf("/*", m);
const head = txt.slice(0, c).replace(/\s+$/, "");
writeFileSync(p, head + "\n", "latin1");
console.log("Truncated corrupted tail at byte", c, "-> new length", head.length + 1);