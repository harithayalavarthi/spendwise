// Plaid access-token encryption at rest (BANK-5). The key file lives in the
// per-file throwaway SPENDWISE_DATA_DIR that tests/setup.ts creates — never
// the project's data/ directory.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/secretBox";

const TOKEN = "access-sandbox-11111111-2222-4333-8444-555555555555";
const dataDir = path.resolve(process.env.SPENDWISE_DATA_DIR ?? "");
const keyPath = path.join(dataDir, "plaid.key");

describe("secretBox (BANK-5)", () => {
  // Must run first in this file: nothing has touched the key yet.
  it("creates a 32-byte key file with mode 0600 in the data directory on first use", () => {
    expect(dataDir.startsWith(path.resolve(os.tmpdir()))).toBe(true);
    expect(fs.existsSync(keyPath)).toBe(false);

    encrypt(TOKEN);

    expect(fs.existsSync(keyPath)).toBe(true);
    const stat = fs.statSync(keyPath);
    expect(stat.size).toBe(32);
    if (process.platform !== "win32") expect(stat.mode & 0o777).toBe(0o600);
  });

  it("reuses the existing key rather than regenerating it", () => {
    const before = fs.readFileSync(keyPath);
    const encoded = encrypt(TOKEN);
    expect(fs.readFileSync(keyPath).equals(before)).toBe(true);
    expect(decrypt(encoded)).toBe(TOKEN);
  });

  it("round-trips a token, including non-ASCII text and the empty string", () => {
    for (const plaintext of [TOKEN, "tök€n ✓", ""]) {
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    }
  });

  it("produces different ciphertext each time (random IV) and never contains the plaintext", () => {
    const a = encrypt(TOKEN);
    const b = encrypt(TOKEN);
    expect(a).not.toBe(b);
    // Layout is base64(iv[12] | authTag[16] | ciphertext); the IVs must differ.
    const ivA = Buffer.from(a, "base64").subarray(0, 12);
    const ivB = Buffer.from(b, "base64").subarray(0, 12);
    expect(ivA.equals(ivB)).toBe(false);
    for (const encoded of [a, b]) {
      expect(encoded).not.toContain(TOKEN);
      expect(Buffer.from(encoded, "base64").toString("utf8")).not.toContain(TOKEN);
      expect(Buffer.from(encoded, "base64").length).toBe(12 + 16 + Buffer.byteLength(TOKEN));
    }
  });

  it("rejects tampered ciphertext, auth tag, or IV (GCM authentication)", () => {
    const raw = Buffer.from(encrypt(TOKEN), "base64");
    for (const offset of [0, 12, raw.length - 1]) {
      const tampered = Buffer.from(raw);
      tampered[offset] ^= 0x01;
      expect(() => decrypt(tampered.toString("base64"))).toThrow();
    }
  });

  it("rejects truncated input", () => {
    const raw = Buffer.from(encrypt(TOKEN), "base64");
    expect(() => decrypt(raw.subarray(0, raw.length - 4).toString("base64"))).toThrow();
    expect(() => decrypt(raw.subarray(0, 20).toString("base64"))).toThrow();
  });

  // Keep last: it replaces this file's key.
  it("cannot decrypt a token encrypted under a different key", () => {
    const encoded = encrypt(TOKEN);
    fs.writeFileSync(keyPath, Buffer.alloc(32, 7), { mode: 0o600 });
    expect(() => decrypt(encoded)).toThrow();
    expect(decrypt(encrypt(TOKEN))).toBe(TOKEN);
  });
});
