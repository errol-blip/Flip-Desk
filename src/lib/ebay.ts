/**
 * eBay comparable-price search — REAL integration, not a stub.
 * ----------------------------------------------------------------
 * Uses eBay's public Browse API (`item_summary/search`), which is free and
 * requires only a developer account: https://developer.ebay.com/my/keys
 * Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET in your environment.
 *
 * IMPORTANT LIMITATION, stated plainly: the Browse API returns ACTIVE
 * listings, not confirmed sold prices. eBay's actual sold/completed-item
 * data lives behind the Marketplace Insights API, which requires a separate,
 * restricted application to eBay (not automatically granted to new
 * developer accounts). So results from this module are tagged as
 * `price_type: 'used' | 'new_retail'` (asking prices), never
 * `actual_sold` — matching the comparable data model's own distinction
 * between asking and sold prices. If/when you get Marketplace Insights
 * access, add a second function here following the same shape and tag its
 * results `actual_sold`.
 */

interface EbayTokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: EbayTokenCache | null = null;

async function getAppToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'EBAY_CLIENT_ID / EBAY_CLIENT_SECRET are not set. Get free credentials at https://developer.ebay.com/my/keys and add them to your environment.'
    );
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay OAuth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return tokenCache.token;
}

export interface EbayComparable {
  title: string;
  price: number;
  shipping: number;
  condition: string | null;
  url: string;
  imageUrl: string | null;
  priceType: 'new_retail' | 'used' | 'open_box';
}

/**
 * Searches eBay's Browse API by UPC/GTIN first (most reliable product match),
 * falling back to a keyword search if no UPC is available or it returns nothing.
 */
export async function searchEbayComparables(params: {
  upc?: string | null;
  keywords?: string | null;
  limit?: number;
}): Promise<{ comparables: EbayComparable[]; searchMethod: 'upc' | 'keywords' | 'none' }> {
  const token = await getAppToken();
  const limit = params.limit ?? 10;

  async function search(query: URLSearchParams) {
    const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${query.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.itemSummaries ?? []) as any[];
  }

  function mapItems(items: any[]): EbayComparable[] {
    return items.map((item) => ({
      title: item.title,
      price: parseFloat(item.price?.value ?? '0'),
      shipping: parseFloat(item.shippingOptions?.[0]?.shippingCost?.value ?? '0'),
      condition: item.condition ?? null,
      url: item.itemWebUrl,
      imageUrl: item.image?.imageUrl ?? null,
      priceType: /new/i.test(item.condition ?? '') ? 'new_retail' : /open box/i.test(item.condition ?? '') ? 'open_box' : 'used',
    }));
  }

  if (params.upc) {
    const gtinQuery = new URLSearchParams({ gtin: params.upc, limit: String(limit) });
    const items = await search(gtinQuery);
    if (items && items.length > 0) {
      return { comparables: mapItems(items), searchMethod: 'upc' };
    }
  }

  if (params.keywords) {
    const kwQuery = new URLSearchParams({ q: params.keywords, limit: String(limit) });
    const items = await search(kwQuery);
    if (items && items.length > 0) {
      return { comparables: mapItems(items), searchMethod: 'keywords' };
    }
  }

  return { comparables: [], searchMethod: 'none' };
}
