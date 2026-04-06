#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { redactAccountNumber } from "@localbanksync/shared";

const FINANCE_SERVICE_URL = process.env.FINANCE_SERVICE_URL || "http://127.0.0.1:8787";

// ── Helpers ──

async function callService<T>(path: string): Promise<T> {
  const resp = await fetch(`${FINANCE_SERVICE_URL}${path}`);
  if (!resp.ok) {
    throw new Error(`finance-service ${path} returned ${resp.status}: ${await resp.text()}`);
  }
  return resp.json() as Promise<T>;
}

async function postService<T>(path: string, body?: unknown): Promise<T> {
  const resp = await fetch(`${FINANCE_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    throw new Error(`finance-service ${path} returned ${resp.status}: ${await resp.text()}`);
  }
  return resp.json() as Promise<T>;
}

/** Strip any fields that could leak secrets and redact account numbers */
function sanitize<T extends Record<string, unknown>>(obj: T): T {
  const cleaned = { ...obj };
  // Never leak these fields
  for (const key of ["access_token", "token", "secret", "plaid_secret"]) {
    delete cleaned[key];
  }
  // Redact mask fields to last 4 digits
  if ("mask" in cleaned && typeof cleaned["mask"] === "string") {
    (cleaned as Record<string, unknown>)["mask"] = redactAccountNumber(cleaned["mask"] as string);
  }
  return cleaned;
}

function sanitizeArray<T extends Record<string, unknown>>(arr: T[]): T[] {
  return arr.map(sanitize);
}

// ── MCP Server ──

const server = new McpServer({
  name: "localbanksync",
  version: "0.1.0",
});

server.tool(
  "finance_list_accounts",
  "List all linked bank accounts with their types and masked numbers",
  {},
  async () => {
    const accounts = await callService<Record<string, unknown>[]>("/accounts");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(sanitizeArray(accounts), null, 2),
        },
      ],
    };
  }
);

server.tool(
  "finance_get_balances",
  "Get current balances for all linked accounts (current, available, currency)",
  {},
  async () => {
    const balances = await callService<Record<string, unknown>[]>("/balances");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(sanitizeArray(balances), null, 2),
        },
      ],
    };
  }
);

server.tool(
  "finance_get_transactions",
  "Get recent transactions. Defaults to last 30 days.",
  { days: z.number().optional().describe("Number of days of history to retrieve (default: 30)") },
  async ({ days }) => {
    const d = days ?? 30;
    const transactions = await callService<Record<string, unknown>[]>(`/transactions?days=${d}`);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(sanitizeArray(transactions), null, 2),
        },
      ],
    };
  }
);

server.tool(
  "finance_get_holdings",
  "Get investment holdings across all linked accounts",
  {},
  async () => {
    const holdings = await callService<Record<string, unknown>[]>("/holdings");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(sanitizeArray(holdings), null, 2),
        },
      ],
    };
  }
);

server.tool(
  "finance_sync_now",
  "Trigger an incremental sync of transactions from Plaid",
  {},
  async () => {
    const result = await postService<Record<string, unknown>>("/sync");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "finance_connection_status",
  "Check connection status of all linked financial institutions",
  {},
  async () => {
    const status = await callService<Record<string, unknown>>("/status");
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }
);

// ── Start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("MCP server failed to start:", err);
  process.exit(1);
});
