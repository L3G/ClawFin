# ClawFin

A local-first bridge between [Plaid](https://plaid.com) and [OpenClaw](https://github.com/anthropics/claude-code) via [MCP](https://modelcontextprotocol.io). All data stays on your machine.

## Quick Start

```bash
npx clawfin
```

That's it. The setup wizard walks you through everything on first run.

## What Happens

1. **First run** — interactive wizard asks for your Plaid API keys
2. **Starts the service** on `http://127.0.0.1:8787`
3. **Open the dashboard** to connect your bank via Plaid Link
4. **Configure Claude** with the MCP snippet the wizard prints

## Architecture

```
┌──────────────┐     stdio      ┌─────────────────┐    HTTP (localhost)    ┌─────────────────┐     HTTPS     ┌───────┐
│   OpenClaw   │◄──────────────►│   mcp-server    │◄──────────────────────►│ finance-service │◄─────────────►│ Plaid │
│   (Claude)   │                │  (thin adapter)  │                       │  (core backend)  │               │  API  │
└──────────────┘                └─────────────────┘                        └────────┬────────┘               └───────┘
                                                                                    │
                                                                          ┌─────────┴─────────┐
                                                                          │  SQLite  │  Vault  │
                                                                          └───────────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| `npx clawfin` | Start service (runs setup on first use) |
| `npx clawfin setup` | Run/re-run the setup wizard |
| `npx clawfin status` | Show connection and service status |
| `npx clawfin test` | Run diagnostic checks |
| `npx clawfin mcp` | Start MCP server (used by Claude) |

## MCP Configuration

Add this to your Claude Code config (`.mcp.json` or `~/.claude.json`):

```json
{
  "mcpServers": {
    "clawfin": {
      "command": "npx",
      "args": ["clawfin", "mcp"]
    }
  }
}
```

The MCP server automatically starts the finance service if it's not running.

## MCP Tools

| Tool | Description |
|------|-------------|
| `finance_list_accounts` | List all linked bank accounts |
| `finance_get_balances` | Get current balances for all accounts |
| `finance_get_transactions` | Get recent transactions (optional `days` param) |
| `finance_get_holdings` | Get investment holdings |
| `finance_sync_now` | Trigger incremental transaction sync |
| `finance_connection_status` | Check connection status |

## How It Works

### Storage

All data lives in `~/.clawfin/`:

| File | Purpose |
|------|---------|
| `config.json` | Plaid environment and port (no secrets) |
| `vault.enc` | AES-256-GCM encrypted credentials and access tokens |
| `master.key` | 32-byte encryption key (chmod 600) |
| `clawfin.db` | SQLite database (accounts, transactions, holdings) |

### Security

- **Plaid credentials** and **access tokens** are encrypted with AES-256-GCM in `vault.enc` — never stored in plaintext
- **config.json** contains only non-secret settings (environment, port)
- **master.key** is a random 32-byte key with restricted file permissions
- **All HTTP** binds to `127.0.0.1` only
- **MCP responses** redact account numbers (last 4 digits only) and strip token fields

### Cross-Platform

Works on macOS, Linux, and Windows. No native dependencies — the vault uses Node.js built-in `crypto` module.

### Migration

If you used an earlier version under the name `LocalBankSync`, ClawFin automatically migrates `~/.localbanksync` to `~/.clawfin` on first run. No data is lost — your vault, database, and config carry over seamlessly.

## Project Structure

```
clawfin/
├── apps/
│   ├── cli/                # CLI entry point + setup wizard
│   ├── finance-service/    # Core backend (Fastify + Plaid SDK)
│   ├── mcp-server/         # MCP stdio server (thin adapter)
│   └── link-ui/            # Plaid Link frontend
├── packages/
│   ├── shared/             # Shared types, config, paths
│   └── vault/              # AES-256-GCM encrypted storage
└── docs/
```

## Development

```bash
git clone https://github.com/L3G/ClawFin.git
cd ClawFin
npm install
npm run build
npm start
```

## Prerequisites

- Node.js >= 20
- A [Plaid](https://dashboard.plaid.com/signup) account (free sandbox available)

## License

MIT
