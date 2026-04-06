import "dotenv/config";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { registerRoutes } from "./routes.js";

const config = loadConfig();

const app = Fastify({ logger: true });

// Only bind to localhost — never expose to network
app.register(async (instance) => {
  registerRoutes(instance, config);
});

// Serve link-ui static files at /link
import path from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.register(fastifyStatic, {
  root: path.resolve(__dirname, "../../link-ui/public"),
  prefix: "/link/",
});

app.listen({ port: config.port, host: "127.0.0.1" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`\n  LocalBankSync finance-service running at ${address}`);
  console.log(`  Open ${address}/link/ to connect your bank\n`);
});
