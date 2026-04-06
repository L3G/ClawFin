import path from "node:path";
import { homedir } from "node:os";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";

/** Root directory for all ClawFin data: ~/.clawfin */
export const DATA_DIR = path.join(homedir(), ".clawfin");
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const VAULT_PATH = path.join(DATA_DIR, "vault.enc");
export const DB_PATH = path.join(DATA_DIR, "clawfin.db");
export const MASTER_KEY_PATH = path.join(DATA_DIR, "master.key");

/** Legacy path from pre-rename installs */
const LEGACY_DATA_DIR = path.join(homedir(), ".localbanksync");

/**
 * Non-secret application settings stored in plaintext config.json.
 * Secrets (plaidClientId, plaidSecret) live only in the encrypted vault.
 */
export interface AppConfig {
  plaidEnv: "sandbox" | "development" | "production";
  port: number;
}

/** Vault key names for Plaid credentials */
export const VAULT_KEY_PLAID_CLIENT_ID = "plaid_client_id";
export const VAULT_KEY_PLAID_SECRET = "plaid_secret";

/**
 * Migrate legacy ~/.localbanksync → ~/.clawfin if needed.
 * - Only runs if legacy dir exists and new dir does NOT exist
 * - Uses rename (atomic on same filesystem)
 * - Renames the DB file inside after move
 */
export function migrateLegacyDataDir(): boolean {
  if (!existsSync(LEGACY_DATA_DIR)) return false;
  if (existsSync(DATA_DIR)) return false; // never overwrite

  try {
    renameSync(LEGACY_DATA_DIR, DATA_DIR);

    // Rename the DB file if it has the old name
    const oldDbPath = path.join(DATA_DIR, "localbanksync.db");
    if (existsSync(oldDbPath) && !existsSync(DB_PATH)) {
      renameSync(oldDbPath, DB_PATH);
    }
    // Also handle WAL/SHM files that SQLite may have left
    for (const suffix of ["-wal", "-shm"]) {
      const oldF = oldDbPath + suffix;
      const newF = DB_PATH + suffix;
      if (existsSync(oldF) && !existsSync(newF)) {
        renameSync(oldF, newF);
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function ensureDataDir(): void {
  migrateLegacyDataDir();
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

export function isConfigured(): boolean {
  migrateLegacyDataDir();
  return existsSync(CONFIG_PATH);
}

export function loadAppConfig(): AppConfig | null {
  migrateLegacyDataDir();
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}

export function saveAppConfig(config: AppConfig): void {
  ensureDataDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

/**
 * Check if config.json contains legacy plaintext secrets and return them.
 * Returns null if no migration is needed.
 */
export function detectLegacySecrets(): {
  plaidClientId: string;
  plaidSecret: string;
} | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof data.plaidClientId === "string" &&
      data.plaidClientId.length > 0 &&
      typeof data.plaidSecret === "string" &&
      data.plaidSecret.length > 0
    ) {
      return {
        plaidClientId: data.plaidClientId,
        plaidSecret: data.plaidSecret,
      };
    }
  } catch {
    // corrupt config — nothing to migrate
  }
  return null;
}

/**
 * Remove legacy secret fields from config.json and re-save.
 */
export function removeLegacySecrets(): void {
  if (!existsSync(CONFIG_PATH)) return;
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    delete data.plaidClientId;
    delete data.plaidSecret;
    writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
  } catch {
    // best-effort
  }
}
