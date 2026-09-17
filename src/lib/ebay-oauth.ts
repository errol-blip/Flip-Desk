/**
 * eBay per-user OAuth — required for actually creating listings in someone's
 * own eBay account (different from the app-level Browse API token used for
 * comparable search, which has no user attached).
 *
 * One-time setup YOU need to do in your eBay Developer account
 * (developer.ebay.com/my/keys) before this works:
 *   1. Under your app's keyset, add the "Sell" API scopes (sell.inventory,
 *      sell.account) — these aren't enabled by default.
 *   2. Under "User Tokens" → "Get a Token from eBay via Your Application",
 *      set up a redirect (an eBay "RuName"): point it at
 *      https://<your-app-domain>/api/ebay/callback
 *   3. Put that RuName value in EBAY_REDIRECT_URI (it looks like
 *      "YourName-YourApp-PRD-abc123-xyz789", NOT a normal URL — eBay's
 *      OAuth quirk, not a bug here).
 *   4. eBay only grants Sell API production access to real, verified seller
 *      accounts — a brand-new/sandbox account may only work in eBay's
 *      Sandbox environment, not production, until eBay approves you.
 */

const SCOPES = ['https://api.ebay.com/oauth/api_scope/sell.inventory', 'https://api.ebay.com/oauth/api_scope/sell.account'].join(' ');

export function getEbayAuthUrl(state: string): string {
  const clientId = process.env.EBAY_CLIENT_ID!;
  const redirectUri = process.env.EBAY_REDIRECT_URI!; // this is an eBay "RuName", not a URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
  });
  return `https://auth.ebay.com/oauth2/authorize?${params.toString()}`;
}

function basicAuthHeader() {
  return Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString('base64');
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuthHeader()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.EBAY_REDIRECT_URI!,
    }),
  });
  if (!res.ok) throw new Error(`eBay token exchange failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuthHeader()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPES,
    }),
  });
  if (!res.ok) throw new Error(`eBay token refresh failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

/**
 * Returns a valid access token for this user, refreshing it first if it's
 * expired or close to it. Callers pass in the stored account row and a
 * save function so the refreshed token gets persisted back to the database.
 */
export async function getValidAccessToken(
  account: { access_token: string; refresh_token: string; access_token_expires_at: string },
  onRefreshed: (accessToken: string, expiresAt: string) => Promise<void>
): Promise<string> {
  const expiresAt = new Date(account.access_token_expires_at).getTime();
  if (expiresAt > Date.now() + 60_000) {
    return account.access_token;
  }
  const refreshed = await refreshAccessToken(account.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await onRefreshed(refreshed.access_token, newExpiresAt);
  return refreshed.access_token;
}
