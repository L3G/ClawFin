import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// ── Error Types ──

export class MissingMasterKeyError extends Error {
  constructor(keyPath: string) {
    super(
      `Vault exists but master key is missing at ${keyPath}.\n` +
        `Your encrypted secrets cannot be decrypted.\n` +
        `Restore ~/.clawfin/master.key from backup, or run "npx clawfin setup" to reconnect your accounts.`
    );
    this.name = "MissingMasterKeyError";
  }
}

export class CorruptMasterKeyError extends Error {
  constructor(keyPath: string, expected: number, got: number) {
    super(
      `Master key at ${keyPath} is corrupted (expected ${expected} bytes, got ${got}).\n` +
        `Restore the original master.key from backup, or run "npx clawfin setup" to start fresh.`
    );
    this.name = "CorruptMasterKeyError";
  }
}

export class VaultDecryptionError extends Error {
  constructor() {
    super(
      `Vault decryption failed — the master key may not match this vault file.\n` +
        `Restore the correct master.key from backup, or run "npx clawfin setup" to reconnect your accounts.`
    );
    this.name = "VaultDecryptionError";
  }
}

// ── Data Structures ──

interface VaultData {
  entries: Record<string, EncryptedEntry>;
}

interface EncryptedEntry {
  iv: string; // hex
  tag: string; // hex
  data: string; // hex
}

/**
 * Cross-platform encrypted vault using AES-256-GCM.
 * Uses a random 32-byte master key stored in a separate file.
 * No native dependencies — Node.js crypto only.
 */
export class Vault {
  private filePath: string;
  private vaultData: VaultData;
  private key: Buffer;

  constructor(filePath: string, masterKeyPath: string) {
    this.filePath = filePath;

    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    const vaultExists = existsSync(filePath);
    this.key = loadOrCreateMasterKey(masterKeyPath, vaultExists);

    if (vaultExists) {
      const raw = readFileSync(filePath, "utf-8");
      this.vaultData = JSON.parse(raw) as VaultData;
    } else {
      this.vaultData = { entries: {} };
    }
  }

  set(key: string, value: string): void {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(value, "utf-8"),
      cipher.final(),
    ]);

    this.vaultData.entries[key] = {
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      data: encrypted.toString("hex"),
    };

    this.flush();
  }

  get(key: string): string | null {
    const entry = this.vaultData.entries[key];
    if (!entry) return null;

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(entry.iv, "hex"),
        { authTagLength: AUTH_TAG_LENGTH }
      );
      decipher.setAuthTag(Buffer.from(entry.tag, "hex"));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(entry.data, "hex")),
        decipher.final(),
      ]);

      return decrypted.toString("utf-8");
    } catch {
      throw new VaultDecryptionError();
    }
  }

  delete(key: string): boolean {
    if (!(key in this.vaultData.entries)) return false;
    delete this.vaultData.entries[key];
    this.flush();
    return true;
  }

  has(key: string): boolean {
    return key in this.vaultData.entries;
  }

  keys(): string[] {
    return Object.keys(this.vaultData.entries);
  }

  /** Returns true if the vault can encrypt and decrypt a test value */
  verify(): boolean {
    const testKey = "__vault_verify__";
    try {
      this.set(testKey, "ok");
      const result = this.get(testKey);
      this.delete(testKey);
      return result === "ok";
    } catch {
      return false;
    }
  }

  private flush(): void {
    writeFileSync(this.filePath, JSON.stringify(this.vaultData), {
      mode: 0o600,
    });
  }
}

/**
 * Load or generate the master key.
 *
 * - If vault exists but key is missing → fail explicitly (no silent regen)
 * - If vault exists and key is wrong size → fail explicitly
 * - If neither exists → generate fresh key
 * - If key exists → load it
 */
function loadOrCreateMasterKey(keyPath: string, vaultExists: boolean): Buffer {
  const dir = path.dirname(keyPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const keyExists = existsSync(keyPath);

  // Case B: vault exists but key is missing — cannot decrypt, fail hard
  if (vaultExists && !keyExists) {
    throw new MissingMasterKeyError(keyPath);
  }

  // Case D / C: key exists — validate it
  if (keyExists) {
    const buf = readFileSync(keyPath);
    if (buf.length !== KEY_LENGTH) {
      throw new CorruptMasterKeyError(keyPath, KEY_LENGTH, buf.length);
    }
    return buf;
  }

  // Case A: fresh install — generate new key
  const key = randomBytes(KEY_LENGTH);
  writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}
