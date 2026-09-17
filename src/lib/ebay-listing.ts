/**
 * Creates a real, live eBay listing using the Sell Inventory API. This is
 * three calls in sequence, per eBay's own required flow:
 *   1. createOrReplaceInventoryItem — defines the product (title, condition, photos, quantity)
 *   2. createOffer — attaches price, listing policies, category
 *   3. publishOffer — actually makes it live and returns a listingId
 *
 * Requires: a merchant location and at least one Fulfillment/Payment/Return
 * policy already set up on the seller's own eBay account (eBay will reject
 * the offer creation call with a clear error naming which policy is missing
 * if not — this code surfaces that error rather than guessing defaults,
 * since guessing a shipping/return policy for someone else's account is
 * not something to fake).
 */

const EBAY_API_BASE = 'https://api.ebay.com';

async function ebayFetch(path: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(`${EBAY_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Content-Language': 'en-US',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay API error at ${path} (${res.status}): ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

export interface EbayListingInput {
  sku: string; // must be unique per seller — we use the Flip Desk inventory row id
  title: string;
  description: string;
  price: number;
  quantity: number;
  condition: 'NEW' | 'LIKE_NEW' | 'USED_EXCELLENT' | 'USED_GOOD' | 'USED_ACCEPTABLE';
  imageUrls: string[];
  categoryId: string; // eBay category ID — the seller must pick one that fits; see note below
  merchantLocationKey: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
}

export async function createAndPublishEbayListing(accessToken: string, input: EbayListingInput) {
  await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(input.sku)}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({
      condition: input.condition,
      product: {
        title: input.title.slice(0, 80),
        description: input.description,
        imageUrls: input.imageUrls.slice(0, 12),
      },
      availability: { shipToLocationAvailability: { quantity: input.quantity } },
    }),
  });

  const offer = await ebayFetch('/sell/inventory/v1/offer', accessToken, {
    method: 'POST',
    body: JSON.stringify({
      sku: input.sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: input.quantity,
      categoryId: input.categoryId,
      listingDescription: input.description,
      pricingSummary: { price: { value: input.price.toFixed(2), currency: 'USD' } },
      merchantLocationKey: input.merchantLocationKey,
      listingPolicies: {
        fulfillmentPolicyId: input.fulfillmentPolicyId,
        paymentPolicyId: input.paymentPolicyId,
        returnPolicyId: input.returnPolicyId,
      },
    }),
  });

  const published = await ebayFetch(`/sell/inventory/v1/offer/${offer.offerId}/publish`, accessToken, {
    method: 'POST',
  });

  return {
    listingId: published.listingId as string,
    offerId: offer.offerId as string,
    listingUrl: `https://www.ebay.com/itm/${published.listingId}`,
  };
}

/** Fetches the seller's existing business policies so the UI can offer a picker instead of guessing IDs. */
export async function getSellerPolicies(accessToken: string) {
  const [fulfillment, payment, returns, locations] = await Promise.all([
    ebayFetch('/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US', accessToken),
    ebayFetch('/sell/account/v1/payment_policy?marketplace_id=EBAY_US', accessToken),
    ebayFetch('/sell/account/v1/return_policy?marketplace_id=EBAY_US', accessToken),
    ebayFetch('/sell/inventory/v1/location', accessToken),
  ]);

  return {
    fulfillmentPolicies: fulfillment.fulfillmentPolicies ?? [],
    paymentPolicies: payment.paymentPolicies ?? [],
    returnPolicies: returns.returnPolicies ?? [],
    locations: locations.locations ?? [],
  };
}
