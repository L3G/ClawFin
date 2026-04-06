import type { FastifyInstance } from "fastify";
import {
  CountryCode,
  Products,
  type RemovedTransaction,
  type Transaction,
} from "plaid";
import type { Config } from "./config.js";
import { getDb } from "./db.js";
import { getPlaidClient } from "./plaid-client.js";
import { getAccessToken, storeAccessToken } from "./secrets.js";
import type {
  AccountRow,
  BalanceResponse,
  HoldingResponse,
  SyncResult,
  TransactionRow,
} from "@localbanksync/shared";

export function registerRoutes(app: FastifyInstance, config: Config): void {
  const plaid = getPlaidClient(config);
  const db = getDb();

  // ── Plaid Link Flow ──

  app.post("/create_link_token", async (_req, reply) => {
    const response = await plaid.linkTokenCreate({
      user: { client_user_id: "local-user" },
      client_name: "LocalBankSync",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });
    return reply.send({ link_token: response.data.link_token });
  });

  app.post<{ Body: { public_token: string; institution_name?: string } }>(
    "/exchange_public_token",
    async (req, reply) => {
      const { public_token, institution_name } = req.body;
      if (!public_token) {
        return reply.status(400).send({ error: "public_token is required" });
      }

      const response = await plaid.itemPublicTokenExchange({
        public_token,
      });

      const { access_token, item_id } = response.data;

      // Store access_token securely in Keychain — never in SQLite
      await storeAccessToken(item_id, access_token);

      // Store item metadata in SQLite
      db.prepare(
        `INSERT OR REPLACE INTO items (item_id, institution_name, status)
         VALUES (?, ?, 'active')`
      ).run(item_id, institution_name || "Unknown");

      // Fetch and store accounts
      const accountsResp = await plaid.accountsGet({ access_token });
      const upsertAccount = db.prepare(
        `INSERT OR REPLACE INTO accounts (account_id, item_id, name, type, subtype, mask)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const acct of accountsResp.data.accounts) {
        upsertAccount.run(
          acct.account_id,
          item_id,
          acct.name,
          acct.type,
          acct.subtype ?? null,
          acct.mask ?? null
        );
      }

      return reply.send({
        item_id,
        accounts_linked: accountsResp.data.accounts.length,
      });
    }
  );

  // ── Data APIs ──

  app.get("/accounts", async (_req, reply) => {
    const rows = db
      .prepare("SELECT account_id, item_id, name, type, subtype, mask FROM accounts")
      .all() as AccountRow[];
    return reply.send(rows);
  });

  app.get("/balances", async (_req, reply) => {
    const items = db.prepare("SELECT item_id FROM items WHERE status = 'active'").all() as Array<{ item_id: string }>;
    const balances: BalanceResponse[] = [];

    for (const item of items) {
      const accessToken = await getAccessToken(item.item_id);
      if (!accessToken) continue;

      const response = await plaid.accountsGet({ access_token: accessToken });
      for (const acct of response.data.accounts) {
        balances.push({
          account_id: acct.account_id,
          name: acct.name,
          type: acct.type,
          current: acct.balances.current,
          available: acct.balances.available,
          currency: acct.balances.iso_currency_code,
          mask: acct.mask,
        });
      }
    }

    return reply.send(balances);
  });

  app.get<{ Querystring: { days?: string } }>("/transactions", async (req, reply) => {
    const days = parseInt(req.query.days || "30", 10);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().split("T")[0];

    const rows = db
      .prepare(
        `SELECT id, account_id, date, amount, name, category
         FROM transactions
         WHERE date >= ?
         ORDER BY date DESC`
      )
      .all(sinceStr) as TransactionRow[];

    return reply.send(rows);
  });

  app.get("/holdings", async (_req, reply) => {
    const items = db.prepare("SELECT item_id FROM items WHERE status = 'active'").all() as Array<{ item_id: string }>;
    const allHoldings: HoldingResponse[] = [];

    for (const item of items) {
      const accessToken = await getAccessToken(item.item_id);
      if (!accessToken) continue;

      try {
        const response = await plaid.investmentsHoldingsGet({
          access_token: accessToken,
        });

        const securitiesMap = new Map(
          response.data.securities.map((s) => [s.security_id, s])
        );

        for (const h of response.data.holdings) {
          const security = securitiesMap.get(h.security_id);
          allHoldings.push({
            account_id: h.account_id,
            security_name: security?.name ?? null,
            ticker: security?.ticker_symbol ?? null,
            quantity: h.quantity,
            value: h.institution_value,
            timestamp: new Date().toISOString(),
          });

          // Cache in SQLite
          db.prepare(
            `INSERT OR REPLACE INTO holdings (account_id, security_id, quantity, value, timestamp)
             VALUES (?, ?, ?, ?, ?)`
          ).run(h.account_id, h.security_id, h.quantity, h.institution_value, new Date().toISOString());
        }
      } catch {
        // Investment products may not be enabled for this item — skip
      }
    }

    return reply.send(allHoldings);
  });

  // ── Sync ──

  app.post("/sync", async (_req, reply) => {
    const items = db.prepare("SELECT item_id FROM items WHERE status = 'active'").all() as Array<{ item_id: string }>;
    const results: Record<string, SyncResult> = {};

    for (const item of items) {
      const accessToken = await getAccessToken(item.item_id);
      if (!accessToken) continue;

      const syncState = db
        .prepare("SELECT cursor FROM sync_state WHERE item_id = ?")
        .get(item.item_id) as { cursor: string } | undefined;

      let cursor = syncState?.cursor || "";
      let added = 0;
      let modified = 0;
      let removed = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await plaid.transactionsSync({
          access_token: accessToken,
          cursor: cursor || undefined,
        });

        const { added: addedTxns, modified: modifiedTxns, removed: removedTxns, next_cursor, has_more } = response.data;

        // Upsert added/modified transactions
        const upsert = db.prepare(
          `INSERT OR REPLACE INTO transactions (id, account_id, date, amount, name, category)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        const processTransaction = (txn: Transaction) => {
          upsert.run(
            txn.transaction_id,
            txn.account_id,
            txn.date,
            txn.amount,
            txn.name,
            txn.personal_finance_category?.primary ?? txn.category?.join(", ") ?? null
          );
        };
        addedTxns.forEach(processTransaction);
        modifiedTxns.forEach(processTransaction);

        // Remove deleted transactions
        const del = db.prepare("DELETE FROM transactions WHERE id = ?");
        removedTxns.forEach((txn: RemovedTransaction) => {
          if (txn.transaction_id) del.run(txn.transaction_id);
        });

        added += addedTxns.length;
        modified += modifiedTxns.length;
        removed += removedTxns.length;
        cursor = next_cursor;
        hasMore = has_more;
      }

      // Save sync state
      const now = new Date().toISOString();
      db.prepare(
        `INSERT OR REPLACE INTO sync_state (item_id, cursor, last_sync)
         VALUES (?, ?, ?)`
      ).run(item.item_id, cursor, now);

      db.prepare("UPDATE items SET last_synced_at = ? WHERE item_id = ?").run(now, item.item_id);

      results[item.item_id] = { added, modified, removed, has_more: false };
    }

    return reply.send(results);
  });

  // ── Status ──

  app.get("/status", async (_req, reply) => {
    const items = db
      .prepare("SELECT item_id, institution_name, status, last_synced_at FROM items")
      .all() as Array<{
        item_id: string;
        institution_name: string;
        status: string;
        last_synced_at: string | null;
      }>;

    return reply.send({
      connected: items.length > 0,
      items,
    });
  });
}
