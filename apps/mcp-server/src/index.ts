#!/usr/bin/env node

/**
 * Standalone entry point — for running MCP server directly.
 * When invoked via CLI (`npx clawfin mcp`), the CLI
 * uses entry.ts instead, which auto-starts finance-service.
 */
import "./entry.js";
