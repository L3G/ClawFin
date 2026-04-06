import keytar from "keytar";

const SERVICE_NAME = "localbanksync";

/**
 * Store a Plaid access token in the macOS Keychain.
 * The item_id is used as the account key — the actual access_token
 * never leaves this module except when calling Plaid APIs.
 */
export async function storeAccessToken(
  itemId: string,
  accessToken: string
): Promise<void> {
  await keytar.setPassword(SERVICE_NAME, itemId, accessToken);
}

/**
 * Retrieve a Plaid access token from the macOS Keychain.
 */
export async function getAccessToken(
  itemId: string
): Promise<string | null> {
  return keytar.getPassword(SERVICE_NAME, itemId);
}

/**
 * Remove a stored access token.
 */
export async function deleteAccessToken(itemId: string): Promise<boolean> {
  return keytar.deletePassword(SERVICE_NAME, itemId);
}

/**
 * List all stored item IDs.
 */
export async function listStoredItems(): Promise<string[]> {
  const credentials = await keytar.findCredentials(SERVICE_NAME);
  return credentials.map((c) => c.account);
}
