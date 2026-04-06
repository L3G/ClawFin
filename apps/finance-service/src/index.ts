import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { getDb } from "./db.js";
import { registerRoutes } from "./routes.js";

const config = loadConfig();
const app = Fastify({ logger: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Health endpoint (used by CLI and MCP server to detect liveness) ──

app.get("/health", async (_req, reply) => {
  let dbStatus = "ok";
  let accounts = 0;
  let lastSync: string | null = null;

  try {
    const db = getDb();
    accounts = (
      db.prepare("SELECT COUNT(*) as count FROM accounts").get() as {
        count: number;
      }
    ).count;
    const syncRow = db
      .prepare(
        "SELECT last_synced_at FROM items WHERE last_synced_at IS NOT NULL ORDER BY last_synced_at DESC LIMIT 1"
      )
      .get() as { last_synced_at: string } | undefined;
    lastSync = syncRow?.last_synced_at ?? null;
  } catch {
    dbStatus = "error";
  }

  return reply.send({
    status: "ok",
    plaid: config.plaidClientId ? "configured" : "missing",
    plaidEnv: config.plaidEnv,
    db: dbStatus,
    accounts,
    lastSync,
  });
});

// ── Global error handler — clean JSON, no stack traces to clients ──

app.setErrorHandler((error: Error & { statusCode?: number }, _req, reply) => {
  const status = error.statusCode ?? 500;
  const message =
    status < 500
      ? error.message
      : "An internal error occurred. Check the service logs.";
  if (status >= 500) {
    app.log.error(error);
  }
  return reply.status(status).send({ error: message });
});

// ── Routes ──

app.register(async (instance) => {
  registerRoutes(instance, config);
});

// ── Serve link-ui at /link/ ──

app.register(fastifyStatic, {
  root: path.resolve(__dirname, "../../link-ui/public"),
  prefix: "/link/",
  decorateReply: false,
});

// ── Serve dashboard at / ──

app.register(fastifyStatic, {
  root: path.resolve(__dirname, "../../link-ui/public"),
  prefix: "/dashboard/",
  decorateReply: false,
});

app.get("/", async (_req, reply) => {
  return reply.type("text/html").send(dashboardHtml(config.port));
});

// ── Start ──

app.listen({ port: config.port, host: "127.0.0.1" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`\n  ClawFin running at ${address}`);
  console.log(`  Dashboard:     ${address}`);
  console.log(`  Connect bank:  ${address}/link/\n`);
});

function dashboardHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ClawFin</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f1117; color: #e4e4e7;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh;
    }
    .dash {
      background: #1a1b23; border: 1px solid #2a2b35; border-radius: 16px;
      padding: 40px; max-width: 480px; width: 100%;
    }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 24px; }
    .row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 0; border-bottom: 1px solid #2a2b35;
      font-size: 14px;
    }
    .row:last-child { border-bottom: none; }
    .label { color: #9ca3af; }
    .ok { color: #34d399; }
    .warn { color: #fbbf24; }
    .err { color: #f87171; }
    .actions { margin-top: 24px; display: flex; gap: 12px; }
    a.btn {
      display: inline-block; background: #6366f1; color: #fff;
      border-radius: 10px; padding: 12px 24px; font-size: 14px;
      font-weight: 500; text-decoration: none; text-align: center;
      flex: 1; transition: background 0.15s;
    }
    a.btn:hover { background: #4f46e5; }
    a.btn.secondary { background: #374151; }
    a.btn.secondary:hover { background: #4b5563; }
    #error { color: #f87171; font-size: 13px; margin-top: 16px; min-height: 18px; }
  </style>
</head>
<body>
  <div class="dash">
    <h1>ClawFin</h1>
    <div class="row"><span class="label">Service</span><span id="svc" class="ok">running</span></div>
    <div class="row"><span class="label">Plaid</span><span id="plaid">…</span></div>
    <div class="row"><span class="label">Environment</span><span id="env">…</span></div>
    <div class="row"><span class="label">Database</span><span id="db">…</span></div>
    <div class="row"><span class="label">Accounts</span><span id="accts">…</span></div>
    <div class="row"><span class="label">Last Sync</span><span id="sync">…</span></div>
    <div class="actions">
      <a class="btn" href="/link/">Connect Bank</a>
      <a class="btn secondary" href="#" id="syncBtn">Sync Now</a>
    </div>
    <div id="error"></div>
  </div>
  <script>
    const API = window.location.origin;
    async function load() {
      try {
        const r = await fetch(API + "/health");
        const h = await r.json();
        el("plaid").textContent = h.plaid;
        el("plaid").className = h.plaid === "configured" ? "ok" : "err";
        el("env").textContent = h.plaidEnv || "unknown";
        el("env").className = h.plaidEnv === "production" ? "warn" : "ok";
        el("db").textContent = h.db;
        el("db").className = h.db === "ok" ? "ok" : "err";
        el("accts").textContent = h.accounts;
        el("accts").className = h.accounts > 0 ? "ok" : "warn";
        el("sync").textContent = h.lastSync ? timeAgo(new Date(h.lastSync)) : "never";
        el("sync").className = h.lastSync ? "ok" : "warn";
      } catch(e) {
        el("error").textContent = e.message;
      }
    }
    el("syncBtn").onclick = async (ev) => {
      ev.preventDefault();
      const btn = el("syncBtn");
      btn.textContent = "Syncing…";
      btn.style.pointerEvents = "none";
      el("error").textContent = "";
      try {
        const r = await fetch(API + "/sync", { method: "POST" });
        const data = await r.json();
        const total = Object.values(data).reduce((s, v) => s + (v.added || 0) + (v.modified || 0), 0);
        await load();
        btn.textContent = total > 0 ? "Synced " + total + " txns" : "Up to date";
        setTimeout(() => { btn.textContent = "Sync Now"; btn.style.pointerEvents = ""; }, 2500);
      } catch(e) {
        el("error").textContent = e.message;
        btn.textContent = "Sync Now";
        btn.style.pointerEvents = "";
      }
    };
    function el(id) { return document.getElementById(id); }
    function timeAgo(d) {
      const s = Math.floor((Date.now() - d.getTime()) / 1000);
      if (s < 60) return "just now";
      const m = Math.floor(s / 60);
      if (m < 60) return m + "m ago";
      const h = Math.floor(m / 60);
      if (h < 24) return h + "h ago";
      return Math.floor(h / 24) + "d ago";
    }
    load();
  </script>
</body>
</html>`;
}
