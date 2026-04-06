#!/usr/bin/env node

import { isConfigured } from "@clawfin/shared";
import { runSetup } from "./setup.js";
import { runStatus } from "./status.js";
import { runTest } from "./test.js";
import { startService } from "./service.js";

const command = process.argv[2];

async function main() {
  switch (command) {
    case "setup":
      await runSetup();
      break;

    case "status":
      await runStatus();
      break;

    case "test":
      await runTest();
      break;

    case "mcp":
      // Delegate to MCP server — resolved at runtime
      await import("./mcp.js");
      break;

    case "start":
      await startService({ foreground: true });
      break;

    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;

    default:
      if (!isConfigured()) {
        await runSetup();
      } else {
        await startService({ foreground: true });
      }
      break;
  }
}

function printHelp() {
  console.log(`
  ClawFin — local-first Plaid-to-MCP bridge

  Usage:
    clawfin            Start service (runs setup if first time)
    clawfin setup      Run interactive setup wizard
    clawfin status     Show connection and service status
    clawfin test       Run diagnostic checks
    clawfin start      Start finance service
    clawfin mcp        Start MCP server (stdio, used by Claude)
    clawfin help       Show this help
`);
}

main().catch((err) => {
  console.error(`\n  Error: ${err.message}\n`);
  process.exit(1);
});
