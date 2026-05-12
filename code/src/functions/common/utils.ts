export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse connection data from a keyring using is_subdomain: true.
 * org_id = the full Odoo URL entered in the "Subdomain" field
 *          (e.g. https://webjoin.odoo.com)
 * key    = the API key (from secret_transform: '.api_key')
 */
export function parseConnectionData(
  key: string,
  orgId?: string
): { baseUrl: string; apiKey: string } {
  const apiKey = key.trim();
  if (!apiKey) {
    throw new Error('Connection key (API key) must not be empty');
  }
  if (!orgId) {
    throw new Error('org_id (Odoo URL) is required');
  }
  let baseUrl = orgId.trim().replace(/\/+$/, '');
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  return { baseUrl, apiKey };
}

/**
 * Legacy parser for base_url|api_key format (kept for fixture compatibility).
 */
export function parseConnectionKey(key: string): { baseUrl: string; apiKey: string } {
  const pipeIdx = key.indexOf('|');
  if (pipeIdx === -1) {
    return { baseUrl: '', apiKey: key };
  }
  const baseUrl = key.substring(0, pipeIdx).replace(/\/+$/, '');
  const apiKey = key.substring(pipeIdx + 1);
  return { baseUrl, apiKey };
}
