import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { redactAccountNumber } from "@clawfin/shared";

const FINANCE_SERVICE_URL =
  process.env.FINANCE_SERVICE_URL || "http://127.0.0.1:8787";

// ── Helpers ──

const SERVICE_DOWN_MSG =
  "ClawFin service is not running.\nStart it with: npx @l3g/clawfin";
const NO_ACCOUNTS_MSG =
  "No financial accounts connected.\nOpen http://127.0.0.1:8787 and click \"Connect Bank\" to link your bank.";

async function callService<T>(path: string): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${FINANCE_SERVICE_URL}${path}`);
  } catch {
    throw new Error(SERVICE_DOWN_MSG);
  }
  if (!resp.ok) {
    throw new Error(friendlyHttpError(path, resp.status));
  }
  return resp.json() as Promise<T>;
}

async function postService<T>(path: string, body?: unknown): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${FINANCE_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(SERVICE_DOWN_MSG);
  }
  if (!resp.ok) {
    throw new Error(friendlyHttpError(path, resp.status));
  }
  return resp.json() as Promise<T>;
}

function friendlyHttpError(path: string, status: number): string {
  if (status === 500) return `The finance service encountered an internal error on ${path}.\nRun: npx @l3g/clawfin test`;
  if (status === 404) return `Endpoint ${path} not found. You may need to update ClawFin.`;
  return `Request to ${path} failed (HTTP ${status}).\nRun: npx @l3g/clawfin status`;
}

/** Guard that throws a friendly error when the account list is empty */
function requireAccounts<T>(data: T[]): T[] {
  if (data.length === 0) throw new Error(NO_ACCOUNTS_MSG);
  return data;
}

function sanitize<T extends Record<string, unknown>>(obj: T): T {
  const cleaned = { ...obj };
  for (const key of ["access_token", "token", "secret", "plaid_secret"]) {
    delete cleaned[key];
  }
  if ("mask" in cleaned && typeof cleaned["mask"] === "string") {
    (cleaned as Record<string, unknown>)["mask"] = redactAccountNumber(
      cleaned["mask"] as string
    );
  }
  return cleaned;
}

function sanitizeArray<T extends Record<string, unknown>>(arr: T[]): T[] {
  return arr.map(sanitize);
}

// ── MCP Server ──

const server = new McpServer({
  name: "clawfin",
  version: "0.1.0",
});

server.tool(
  "finance_list_accounts",
  "List all linked bank accounts with their types and masked numbers",
  {},
  async () => {
    const accounts = requireAccounts(
      await callService<Record<string, unknown>[]>("/accounts")
    );
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
    const balances = requireAccounts(
      await callService<Record<string, unknown>[]>("/balances")
    );
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
  {
    days: z
      .number()
      .optional()
      .describe("Number of days of history to retrieve (default: 30)"),
  },
  async ({ days }) => {
    const d = days ?? 30;
    const transactions = await callService<Record<string, unknown>[]>(
      `/transactions?days=${d}`
    );
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

const transport = new StdioServerTransport();
await server.connect(transport);
