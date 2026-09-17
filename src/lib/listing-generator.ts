/**
 * Listing draft generator — V1
 * -----------------------------
 * This is a deterministic, template-based generator, NOT a call to an AI
 * model. Building a real LLM-backed generator requires an API key (e.g.
 * ANTHROPIC_API_KEY) which this project doesn't assume you have configured,
 * so rather than fake it, V1 ships a genuinely useful rule-based draft you
 * can edit before copying anywhere.
 *
 * To upgrade this to a real LLM call later: keep this same function
 * signature, and inside `generateListingDraft`, call the Anthropic API
 * (server-side only, key in an env var, never exposed to the client) with
 * the product/inventory facts as context, requesting the same JSON shape
 * this function returns. Nothing else in the app needs to change.
 */

import type { Product } from './types';

export interface ListingDraft {
  title: string;
  short_description: string;
  full_description: string;
  suggested_asking_price: number | null;
  suggested_quick_sale_price: number | null;
  keywords: string[];
}

const CONDITION_COPY: Record<string, string> = {
  like_new: 'Like New',
  open_box: 'Open Box',
  used_good: 'Used - Good',
  used_fair: 'Used - Fair',
  damaged: 'For Parts / Damaged',
  incomplete: 'Incomplete',
  unknown: 'See Description',
};

export function generateListingDraft(
  product: Pick<Product, 'name' | 'brand_id' | 'model_number' | 'condition' | 'description' | 'retail_msrp'>,
  brandName: string | null,
  expectedResale: number | null,
  quickSalePrice: number | null,
  platform: 'website' | 'facebook_marketplace' | 'ebay' | 'offerup'
): ListingDraft {
  const conditionLabel = CONDITION_COPY[product.condition] ?? 'See Description';
  const brandPrefix = brandName ? `${brandName} ` : '';
  const modelSuffix = product.model_number ? ` (Model ${product.model_number})` : '';

  const title = `${brandPrefix}${product.name}${modelSuffix} — ${conditionLabel}`.slice(0, 80);

  const savingsLine =
    product.retail_msrp && expectedResale
      ? `Save roughly $${Math.max(0, product.retail_msrp - expectedResale).toFixed(0)} off original retail of $${product.retail_msrp.toFixed(0)}.`
      : '';

  const shortDescription = `${conditionLabel} ${brandPrefix}${product.name}. ${savingsLine}`.trim();

  const platformNote: Record<typeof platform, string> = {
    website: '',
    facebook_marketplace: '\n\nLocal pickup available — message for details.',
    ebay: '\n\nCarefully inspected before listing. Ships promptly with tracking.',
    offerup: '\n\nCash or verified payment on pickup.',
  };

  const fullDescription = [
    `${conditionLabel} — ${brandPrefix}${product.name}${modelSuffix}.`,
    product.description ? product.description : null,
    'Inspected prior to listing. Photos shown are of the actual item.',
    savingsLine || null,
    platformNote[platform] || null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const keywords = Array.from(
    new Set(
      [brandName, product.name, product.model_number, conditionLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
    )
  ).slice(0, 12);

  return {
    title,
    short_description: shortDescription,
    full_description: fullDescription,
    suggested_asking_price: expectedResale,
    suggested_quick_sale_price: quickSalePrice,
    keywords,
  };
}
