import prompts from "prompts";
import {
  ensureDataDir,
  isConfigured,
  loadAppConfig,
  saveAppConfig,
  VAULT_PATH,
  MASTER_KEY_PATH,
  VAULT_KEY_PLAID_CLIENT_ID,
  VAULT_KEY_PLAID_SECRET,
  type AppConfig,
} from "@clawfin/shared";
import { Vault } from "@clawfin/vault";

export async function runSetup(): Promise<void> {
  console.log("\n  ClawFin Setup\n  ───────────────────\n");

  if (isConfigured()) {
    const existing = loadAppConfig();
    console.log(`  Existing configuration found (Plaid env: ${existing?.plaidEnv}).`);
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: "Reconfigure?",
      initial: false,
    });
    if (!overwrite) {
      console.log("  Setup cancelled.\n");
      return;
    }
  }

  const { hasPlaid } = await prompts({
    type: "confirm",
    name: "hasPlaid",
    message: "Do you have a Plaid developer account?",
    initial: true,
  });

  if (!hasPlaid) {
    console.log(`
  You need a Plaid account to use ClawFin.

  1. Sign up at https://dashboard.plaid.com/signup
  2. Get your API keys from https://dashboard.plaid.com/developers/keys
  3. Run this setup again: npx @l3g/clawfin setup
`);
    return;
  }

  const answers = await prompts([
    {
      type: "text",
      name: "plaidClientId",
      message: "Plaid Client ID",
      validate: (v: string) => v.length > 0 || "Required",
    },
    {
      type: "password",
      name: "plaidSecret",
      message: "Plaid Secret",
      validate: (v: string) => v.length > 0 || "Required",
    },
    {
      type: "select",
      name: "plaidEnv",
      message: "Plaid Environment",
      choices: [
        { title: "Sandbox (testing)", value: "sandbox" },
        { title: "Development (real banks, 100 items)", value: "development" },
        { title: "Production", value: "production" },
      ],
      initial: 0,
    },
    {
      type: "number",
      name: "port",
      message: "Service port",
      initial: 8787,
    },
  ]);

  // User cancelled (Ctrl+C)
  if (!answers.plaidClientId || !answers.plaidSecret) {
    console.log("\n  Setup cancelled.\n");
    return;
  }

  ensureDataDir();

  // Save non-secret settings to config.json
  const config: AppConfig = {
    plaidEnv: answers.plaidEnv,
    port: answers.port,
  };
  saveAppConfig(config);

  // Save secrets to encrypted vault only
  const vault = new Vault(VAULT_PATH, MASTER_KEY_PATH);
  vault.set(VAULT_KEY_PLAID_CLIENT_ID, answers.plaidClientId);
  vault.set(VAULT_KEY_PLAID_SECRET, answers.plaidSecret);

  console.log(`
  Setup complete!

  Settings saved to ~/.clawfin/config.json
  Secrets encrypted in ~/.clawfin/vault.enc

  Next steps:

  1. Start the service:
     npx @l3g/clawfin

  2. Open your browser to connect your bank:
     http://127.0.0.1:${config.port}/link/

  3. Add to Claude Code (paste into ~/.claude.json or .mcp.json):
`);

  printMcpConfig();
}

export function printMcpConfig(): void {
  const config = JSON.stringify(
    {
      mcpServers: {
        clawfin: {
          command: "npx",
          args: ["@l3g/clawfin", "mcp"],
        },
      },
    },
    null,
    2
  );
  console.log(`  ${config.split("\n").join("\n  ")}\n`);
}
