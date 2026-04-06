import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import type { Config } from "./config.js";

let client: PlaidApi;

export function getPlaidClient(config: Config): PlaidApi {
  if (!client) {
    const configuration = new Configuration({
      basePath: config.plaidBaseUrl,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": config.plaidClientId,
          "PLAID-SECRET": config.plaidSecret,
        },
      },
    });
    client = new PlaidApi(configuration);
  }
  return client;
}
