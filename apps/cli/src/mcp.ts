/**
 * MCP entry point — launched via `npx @l3g/clawfin mcp`.
 * Ensures finance-service is running, then starts the MCP server.
 */
import { loadAppConfig } from "@clawfin/shared";
import { ensureServiceRunning } from "./service.js";

const config = loadAppConfig();
if (!config) {
  process.stderr.write(
    "ClawFin is not configured. Run: npx @l3g/clawfin setup\n"
  );
  process.exit(1);
}

// Set the URL so the MCP server knows where to connect
process.env.FINANCE_SERVICE_URL = `http://127.0.0.1:${config.port}`;

// Ensure finance-service is alive before starting MCP
await ensureServiceRunning(config.port);

// Now start the actual MCP server
await import("./mcp-entry.js");
