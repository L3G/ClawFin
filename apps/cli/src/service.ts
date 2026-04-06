import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadAppConfig, isConfigured } from "@clawfin/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the finance-service entry point.
 * Works both in dev (src/dist colocated) and published installs
 * by resolving relative to this file's location in the monorepo.
 */
function resolveServiceEntry(): string {
  // From cli/dist/service.js → finance-service/dist/index.js
  // From cli/src/service.ts → finance-service/dist/index.js  (same relative)
  return path.resolve(__dirname, "../../finance-service/dist/index.js");
}

export async function startService(opts: { foreground: boolean }): Promise<void> {
  if (!isConfigured()) {
    console.error("\n  Not configured. Run: npx clawfin setup\n");
    process.exit(1);
  }

  const config = loadAppConfig()!;
  const serviceEntry = resolveServiceEntry();

  console.log(`\n  Starting ClawFin on http://127.0.0.1:${config.port}`);
  console.log(`  Open http://127.0.0.1:${config.port}/link/ to connect your bank\n`);

  if (opts.foreground) {
    const child = spawn("node", [serviceEntry], {
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });

    child.on("exit", (code) => process.exit(code ?? 0));

    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.on(sig, () => child.kill(sig));
    }
  }
}

/**
 * Ensure the finance service is running. If not, spawn it in the background.
 * Returns once the service responds to /health.
 */
export async function ensureServiceRunning(port: number): Promise<void> {
  if (await isServiceHealthy(port)) return;

  const serviceEntry = resolveServiceEntry();

  const child = spawn("node", [serviceEntry], {
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "production" },
  });
  child.unref();

  // Wait for health check (up to 15s)
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await sleep(500);
    if (await isServiceHealthy(port)) return;
  }

  throw new Error(
    `Finance service failed to start on port ${port}.\nRun "npx clawfin" manually for details.`
  );
}

export async function isServiceHealthy(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
