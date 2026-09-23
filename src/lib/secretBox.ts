import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// A Plaid access token is a long-lived credential that can keep pulling an
// account's transactions until revoked — it can't sit in plaintext next to
// the transaction data. This is app-level encryption (a random key in its
// own file, not the OS keychain): the Next.js server runs as a separate
// process from Electron's main process (see electron/main.ts's
// ELECTRON_RUN_AS_NODE spawn) with no access to Electron's safeStorage, and
// safeStorage wouldn't help `npm run dev` at all anyway. This is weaker than
// OS-level protection but is a real improvement over plaintext and matches
// this app's single-user local-app threat model — see
// docs/plaid-bank-sync.md for the full reasoning.
const DATA_DIR = process.env.SPENDWISE_DATA_DIR
  ? path.resolve(process.env.SPENDWISE_DATA_DIR)
  : path.join(process.cwd(), "data");
const KEY_PATH = path.join(DATA_DIR, "plaid.key");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getKey(): Buffer {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(KEY_PATH)) {
    fs.writeFileSync(KEY_PATH, crypto.randomBytes(32), { mode: 0o600 });
  }
  return fs.readFileSync(KEY_PATH);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
