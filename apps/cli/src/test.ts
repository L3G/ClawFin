import {
  Vault,
  MissingMasterKeyError,
  CorruptMasterKeyError,
  VaultDecryptionError,
} from "@clawfin/vault";
import {
  isConfigured,
  loadAppConfig,
  VAULT_PATH,
  MASTER_KEY_PATH,
  VAULT_KEY_PLAID_CLIENT_ID,
  VAULT_KEY_PLAID_SECRET,
} from "@clawfin/shared";
import { isServiceHealthy, ensureServiceRunning } from "./service.js";

interface HealthResponse {
  status: string;
  plaid: string;
  db: string;
  accounts: number;
  lastSync: string | null;
}

export async function runTest(): Promise<void> {
  console.log("\n  ClawFin Diagnostics\n  ─────────────────────────\n");

  let failures = 0;

  // 1. Config
  if (!isConfigured()) {
    fail("Config missing — run: npx clawfin setup");
    console.log();
    process.exitCode = 1;
    return;
  }
  const config = loadAppConfig();
  if (!config || !config.plaidEnv) {
    fail("Config file is invalid — run: npx clawfin setup");
    console.log();
    process.exitCode = 1;
    return;
  }
  pass("Config loaded");

  // 2. Vault + master key integrity
  let vault: Vault;
  try {
    vault = new Vault(VAULT_PATH, MASTER_KEY_PATH);
  } catch (err) {
    if (
      err instanceof MissingMasterKeyError ||
      err instanceof CorruptMasterKeyError
    ) {
      fail(err.message);
    } else {
      fail(`Vault error: ${(err as Error).message}`);
    }
    console.log(`\n  1 check(s) failed.\n`);
    process.exitCode = 1;
    return;
  }

  if (!vault.verify()) {
    fail("Vault read/write round-trip failed");
    failures++;
  } else {
    pass("Vault accessible");
  }

  // 3. Plaid credentials in vault
  try {
    const hasClientId = vault.get(VAULT_KEY_PLAID_CLIENT_ID);
    const hasSecret = vault.get(VAULT_KEY_PLAID_SECRET);
    if (hasClientId && hasSecret) {
      pass(`Plaid credentials present (env: ${config.plaidEnv})`);
    } else {
      fail("Plaid credentials missing from vault — run: npx clawfin setup");
      failures++;
    }
  } catch (err) {
    if (err instanceof VaultDecryptionError) {
      fail("Vault decryption failed — master.key may not match vault.enc");
    } else {
      fail(`Error reading credentials: ${(err as Error).message}`);
    }
    failures++;
  }

  // 4. Service
  const port = config.port;
  let running = await isServiceHealthy(port);
  if (!running) {
    info("Service not running, starting...");
    try {
      await ensureServiceRunning(port);
      running = true;
    } catch {
      fail("Service failed to start — run: npx clawfin");
      failures++;
    }
  }
  if (running) {
    pass(`Service running on port ${port}`);
  }

  // 5. Health check
  if (running) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      const health = (await resp.json()) as HealthResponse;

      if (health.status === "ok" && health.db === "ok") {
        pass("Health check passed");
      } else {
        fail(`Health check: db=${health.db}, plaid=${health.plaid}`);
        failures++;
      }
    } catch {
      fail("Health endpoint did not respond");
      failures++;
    }
  }

  // Summary
  console.log();
  if (failures === 0) {
    console.log("  All checks passed.\n");
  } else {
    console.log(`  ${failures} check(s) failed.\n`);
    process.exitCode = 1;
  }
}

function pass(msg: string) {
  console.log(`  \u2714 ${msg}`);
}
function fail(msg: string) {
  console.log(`  \u2718 ${msg}`);
}
function info(msg: string) {
  console.log(`  \u2026 ${msg}`);
}
