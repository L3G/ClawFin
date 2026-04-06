import { isConfigured, loadAppConfig } from "@clawfin/shared";

interface HealthResponse {
  status: string;
  plaid: string;
  plaidEnv: string;
  db: string;
  accounts: number;
  lastSync: string | null;
}

export async function runStatus(): Promise<void> {
  console.log("\n  ClawFin Status\n  ────────────────────\n");

  // Check config
  if (!isConfigured()) {
    console.log("  ✗ Not configured — run: npx clawfin setup\n");
    return;
  }
  const config = loadAppConfig()!;
  console.log(`  ✔ Configured (${config.plaidEnv})`);

  // Check service
  const url = `http://127.0.0.1:${config.port}`;
  try {
    const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) throw new Error("bad status");
    const health = (await resp.json()) as HealthResponse;

    console.log(`  ✔ Service running on port ${config.port}`);
    console.log(`  ${health.plaid === "configured" ? "✔" : "✗"} Plaid ${health.plaid}`);
    console.log(`  ✔ Environment: ${health.plaidEnv}`);
    console.log(`  ${health.db === "ok" ? "✔" : "✗"} Database ${health.db}`);
    console.log(`  ${health.accounts > 0 ? "✔" : "–"} Accounts connected: ${health.accounts}`);

    if (health.lastSync) {
      const ago = formatTimeAgo(new Date(health.lastSync));
      console.log(`  ✔ Last sync: ${ago}`);
    } else {
      console.log("  – Never synced");
    }
  } catch {
    console.log(`  ✗ Service not running`);
    console.log(`    Start it with: npx clawfin`);
  }

  console.log();
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
