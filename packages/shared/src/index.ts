export {
  DATA_DIR,
  CONFIG_PATH,
  VAULT_PATH,
  DB_PATH,
  MASTER_KEY_PATH,
  VAULT_KEY_PLAID_CLIENT_ID,
  VAULT_KEY_PLAID_SECRET,
  migrateLegacyDataDir,
  ensureDataDir,
  isConfigured,
  loadAppConfig,
  saveAppConfig,
  detectLegacySecrets,
  removeLegacySecrets,
  type AppConfig,
} from "./paths.js";

// ── Database Row Types ──

export interface ItemRow {
  item_id: string;
  institution_name: string;
  status: "active" | "inactive" | "error";
  last_synced_at: string | null;
}

export interface AccountRow {
  account_id: string;
  item_id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
}

export interface TransactionRow {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  name: string;
  category: string | null;
}

export interface HoldingRow {
  account_id: string;
  security_id: string;
  quantity: number;
  value: number;
  timestamp: string;
}

export interface SyncStateRow {
  item_id: string;
  cursor: string;
  last_sync: string;
}

// ── API Response Types ──

export interface AccountResponse {
  account_id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
}

export interface BalanceResponse {
  account_id: string;
  name: string;
  type: string;
  current: number | null;
  available: number | null;
  currency: string | null;
  mask: string | null;
}

export interface TransactionResponse {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  name: string;
  category: string | null;
}

export interface HoldingResponse {
  account_id: string;
  security_name: string | null;
  ticker: string | null;
  quantity: number;
  value: number;
  timestamp: string;
}

export interface ConnectionStatus {
  connected: boolean;
  items: Array<{
    item_id: string;
    institution_name: string;
    status: string;
    last_synced_at: string | null;
  }>;
}

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  has_more: boolean;
}

// ── Utility ──

/** Redact an account number to show only last 4 digits */
export function redactAccountNumber(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return value;
  return "****" + value.slice(-4);
}
