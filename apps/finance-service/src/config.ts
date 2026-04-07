import { PlaidEnvironments } from "plaid";
import {
  loadAppConfig,
  VAULT_PATH,
  MASTER_KEY_PATH,
  VAULT_KEY_PLAID_CLIENT_ID,
  VAULT_KEY_PLAID_SECRET,
  detectLegacySecrets,
  removeLegacySecrets,
} from "@clawfin/shared";
import { Vault } from "@clawfin/vault";

export interface Config {
  plaidClientId: string;
  plaidSecret: string;
  plaidEnv: string;
  plaidBaseUrl: string;
  port: number;
}

export function loadConfig(): Config {
  const appConfig = loadAppConfig();
  if (!appConfig) {
    throw new Error(
      "ClawFin is not configured.\nRun: npx @l3g/clawfin setup"
    );
  }

  const vault = new Vault(VAULT_PATH, MASTER_KEY_PATH);

  // Migrate legacy plaintext secrets from config.json into vault
  const legacy = detectLegacySecrets();
  if (legacy) {
    if (!vault.has(VAULT_KEY_PLAID_CLIENT_ID)) {
      vault.set(VAULT_KEY_PLAID_CLIENT_ID, legacy.plaidClientId);
    }
    if (!vault.has(VAULT_KEY_PLAID_SECRET)) {
      vault.set(VAULT_KEY_PLAID_SECRET, legacy.plaidSecret);
    }
    removeLegacySecrets();
  }

  const plaidClientId = vault.get(VAULT_KEY_PLAID_CLIENT_ID);
  const plaidSecret = vault.get(VAULT_KEY_PLAID_SECRET);

  if (!plaidClientId || !plaidSecret) {
    throw new Error(
      "Plaid credentials not found in vault.\nRun: npx @l3g/clawfin setup"
    );
  }

  const envMap: Record<string, string> = {
    sandbox: PlaidEnvironments.sandbox,
    development: PlaidEnvironments.development,
    production: PlaidEnvironments.production,
  };

  const plaidBaseUrl = envMap[appConfig.plaidEnv];
  if (!plaidBaseUrl) {
    throw new Error(
      `Invalid Plaid environment: "${appConfig.plaidEnv}". Must be sandbox, development, or production.`
    );
  }

  return {
    plaidClientId,
    plaidSecret,
    plaidEnv: appConfig.plaidEnv,
    plaidBaseUrl,
    port: appConfig.port,
  };
}
