import { PlaidEnvironments } from "plaid";

export interface Config {
  plaidClientId: string;
  plaidSecret: string;
  plaidEnv: string;
  plaidBaseUrl: string;
  port: number;
}

export function loadConfig(): Config {
  const plaidClientId = process.env.PLAID_CLIENT_ID;
  const plaidSecret = process.env.PLAID_SECRET;
  const plaidEnv = process.env.PLAID_ENV || "sandbox";
  const port = parseInt(process.env.PORT || "8787", 10);

  if (!plaidClientId || !plaidSecret) {
    throw new Error(
      "Missing required environment variables: PLAID_CLIENT_ID and PLAID_SECRET must be set in .env"
    );
  }

  const envMap: Record<string, string> = {
    sandbox: PlaidEnvironments.sandbox,
    development: PlaidEnvironments.development,
    production: PlaidEnvironments.production,
  };

  const plaidBaseUrl = envMap[plaidEnv];
  if (!plaidBaseUrl) {
    throw new Error(
      `Invalid PLAID_ENV: "${plaidEnv}". Must be sandbox, development, or production.`
    );
  }

  return { plaidClientId, plaidSecret, plaidEnv, plaidBaseUrl, port };
}
