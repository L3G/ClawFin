import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "finance-service": "../finance-service/src/index.ts",
    "mcp-entry": "../mcp-server/src/entry.ts",
  },
  format: "esm",
  target: "node20",
  platform: "node",
  splitting: true,
  clean: true,
  sourcemap: true,
  external: [
    // Native addon — cannot be bundled
    "better-sqlite3",
    // Large npm packages installed normally
    "fastify",
    "@fastify/static",
    "plaid",
    "@modelcontextprotocol/sdk",
    "zod",
    "prompts",
    // Cross-entry import resolved at runtime (sibling in dist/)
    "./mcp-entry.js",
  ],
  noExternal: [
    // Workspace packages — inline into the bundle
    /^@l3g\//,
    /^@clawfin\//,
  ],
});
