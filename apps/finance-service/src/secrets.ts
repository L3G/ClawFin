import { Vault } from "@clawfin/vault";
import { VAULT_PATH, MASTER_KEY_PATH } from "@clawfin/shared";

const PREFIX = "plaid_access_token:";

let vault: Vault;

function getVault(): Vault {
  if (!vault) {
    vault = new Vault(VAULT_PATH, MASTER_KEY_PATH);
  }
  return vault;
}

/**
 * Store a Plaid access token in the encrypted vault.
 * The access_token never leaves this module except when calling Plaid APIs.
 */
export async function storeAccessToken(
  itemId: string,
  accessToken: string
): Promise<void> {
  getVault().set(`${PREFIX}${itemId}`, accessToken);
}

export async function getAccessToken(
  itemId: string
): Promise<string | null> {
  return getVault().get(`${PREFIX}${itemId}`);
}

export async function deleteAccessToken(itemId: string): Promise<boolean> {
  return getVault().delete(`${PREFIX}${itemId}`);
}

export async function listStoredItems(): Promise<string[]> {
  return getVault()
    .keys()
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => k.slice(PREFIX.length));
}
