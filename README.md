# LocalBankSync

A local-first bridge between [Plaid](https://plaid.com) and [OpenClaw](https://github.com/anthropics/claude-code) via [MCP](https://modelcontextprotocol.io). All data stays on your machine.

## Architecture

```
┌──────────────┐     stdio      ┌─────────────────┐    HTTP (localhost)    ┌─────────────────┐     HTTPS     ┌───────┐
│   OpenClaw   │◄──────────────►│   mcp-server    │◄──────────────────────►│ finance-service │◄─────────────►│ Plaid │
│   (Claude)   │                │  (thin adapter)  │                       │  (core backend)  │               │  API  │
└──────────────┘                └─────────────────┘                        └────────┬────────┘               └───────┘
                                                                                    │
                                                                          ┌─────────┴─────────┐
                                                                          │  SQLite  │ Keychain │
                                                                          └───────────────────┘
```

**Key security properties:**
- Plaid access tokens are stored in macOS Keychain, never in SQLite or exposed to the MCP layer
- All services bind only to `127.0.0.1`
- Account numbers are redacted (last 4 digits only) in MCP responses

## Prerequisites

- Node.js >= 20
- macOS (for Keychain integration)
- A [Plaid](https://dashboard.plaid.com/signup) account (free sandbox available)

## Quick Start

### 1. Install

```bash
cd localbanksync
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your Plaid credentials:

```
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox
PORT=8787
```

### 3. Run the finance service

```bash
npm run dev
```

### 4. Connect your bank

Open [http://127.0.0.1:8787/link/](http://127.0.0.1:8787/link/) in your browser and follow the Plaid Link flow.

In sandbox mode, use these test credentials:
- Username: `user_good`
- Password: `pass_good`

### 5. Configure OpenClaw

Add this to your Claude Code MCP settings (`~/.claude/claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "localbanksync": {
      "command": "node",
      "args": ["<path-to>/localbanksync/apps/mcp-server/dist/index.js"],
      "env": {
        "FINANCE_SERVICE_URL": "http://127.0.0.1:8787"
      }
    }
  }
}
```

Or for development with tsx:

```json
{
  "mcpServers": {
    "localbanksync": {
      "command": "npx",
      "args": ["tsx", "<path-to>/localbanksync/apps/mcp-server/src/index.ts"],
      "env": {
        "FINANCE_SERVICE_URL": "http://127.0.0.1:8787"
      }
    }
  }
}
```

### 6. Use it

Ask Claude things like:
- "What are my account balances?"
- "Show my recent transactions"
- "What investments do I hold?"
- "Sync my latest transactions"

## MCP Tools

| Tool | Description |
|------|-------------|
| `finance_list_accounts` | List all linked bank accounts |
| `finance_get_balances` | Get current balances for all accounts |
| `finance_get_transactions` | Get recent transactions (optional `days` parameter) |
| `finance_get_holdings` | Get investment holdings |
| `finance_sync_now` | Trigger incremental transaction sync |
| `finance_connection_status` | Check connection status of linked institutions |

## Project Structure

```
localbanksync/
├── apps/
│   ├── finance-service/    # Core backend (Fastify + Plaid SDK)
│   ├── mcp-server/         # MCP stdio server (thin adapter)
│   └── link-ui/            # Plaid Link frontend
├── packages/
│   └── shared/             # Shared types and utilities
└── docs/
```

## Development

```bash
# Run finance-service in watch mode
npm run dev

# Build all packages
npm run build

# Run MCP server (for testing)
npm run mcp
```

## Security

- Access tokens are stored in macOS Keychain via `keytar`
- SQLite stores only metadata, never secrets
- The MCP server redacts account numbers and strips token fields
- All HTTP traffic is localhost-only

## License

MIT
