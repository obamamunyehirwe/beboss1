// Generates the BeBoss platform Ed25519 receipt-signing keypair.
//
// Usage (from web/):
//   node scripts/receipt-keygen.mjs
//
// The PUBLIC key is written to src/lib/receipt-public-key.json and is safe to
// commit: it is what every customer device and the public /verify page use to
// validate receipts OFFLINE. The PRIVATE key is printed to stderr only. Store it
// as a server secret (e.g. Supabase Edge Function secret RECEIPT_SIGNING_KEY or
// a desktop/CI secret). Never commit the private key.

import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "src", "lib", "receipt-public-key.json");

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicJwk = publicKey.export({ format: "jwk" });
const privateJwk = privateKey.export({ format: "jwk" });

const kid = "beboss-receipts-1";
const document = {
  kid,
  alg: "EdDSA",
  use: "sig",
  publicKey: publicJwk,
};

writeFileSync(outPath, JSON.stringify(document, null, 2) + "\n", "utf8");
console.error("Public key written to " + outPath);
console.error("Store this PRIVATE key as a server secret (never commit):");
console.error(JSON.stringify({ kid, privateKey: privateJwk }, null, 2));