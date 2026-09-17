import { NextRequest, NextResponse } from 'next/server';
import { getOwnerFromToken } from '@/lib/auth-token';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { computeSnapshot } from '@/lib/bid-engine';
import { searchEbayComparables } from '@/lib/ebay';
import { estimateResaleValue } from '@/lib/calculations';

interface BulkItem {
  name?: string;
  upc?: string;
  source_url?: string;
  condition?: string;
  current_bid?: number;
  retail_msrp?: number;
}

interface BulkResult {
  input: BulkItem;
  status: 'added' | 'no_estimate' | 'error';
  flipScore?: number | null;
  maxBid?: number | null;
  error?: string;
}

/**
 * Shared by two callers:
 *  - the Chrome extension's bulk-queue ("Add N to Watchlist" from a category page), authenticated by API token
 *  - the web app's /bulk-add page, authenticated by the normal browser session
 * Both end up here so the pipeline (eBay lookup -> estimate -> bid/flip calc -> save) only exists once.
 */
async function processBulkItems(
  items: BulkItem[],
  ownerId: string,
  supabase: any,
  pickupCostOverride?: number
): Promise<BulkResult[]> {
  const { data: settingsRow } = await supabase.from('settings').select('*').eq('owner_id', ownerId).maybeSingle();
  const results: BulkResult[] = [];

  // Sequential on purpose — eBay's free tier rate-limits aggressively, and
  // this is a background-ish bulk operation, not a live UI interaction.
  for (const item of items) {
    if (!item.name && !item.upc) {
      results.push({ input: item, status: 'error', error: 'Each item needs at least a name or a UPC' });
      continue;
    }

    try {
      const { data: product, error: productError } = await supabase
        .from('products')
        .insert({
          owner_id: ownerId,
          source_type: item.source_url ? 'macbid' : 'manual',
          source_url: item.source_url ?? null,
          upc: item.upc ?? null,
          name: item.name ?? `UPC ${item.upc}`,
          condition: item.condition ?? 'like_new',
          current_bid: item.current_bid ?? null,
          retail_msrp: item.retail_msrp ?? null,
        })
        .select()
        .single();

      if (productError || !product) {
        results.push({ input: item, status: 'error', error: productError?.message ?? 'Could not create product' });
        continue;
      }

      const ebayResult = await searchEbayComparables({ upc: item.upc, keywords: item.name, limit: 8 });

      if (ebayResult.comparables.length === 0) {
        await supabase
          .from('watchlist')
          .upsert(
            { owner_id: ownerId, product_id: product.id, status: 'watching', updated_at: new Date().toISOString() },
            { onConflict: 'owner_id,product_id' }
          );
        results.push({ input: item, status: 'no_estimate' });
        continue;
      }

      await supabase.from('comparables').insert(
        ebayResult.comparables.map((c) => ({
          product_id: product.id,
          owner_id: ownerId,
          source: 'ebay' as const,
          price_type: c.priceType,
          title: c.title,
          price: c.price,
          shipping: c.shipping,
          condition_note: c.condition,
          url: c.url,
          sold_or_active: 'active',
          confidence: 'medium',
        }))
      );

      const estimate = estimateResaleValue(
        ebayResult.comparables.map((c) => ({ price: c.price, priceType: c.priceType, confidence: 'medium' as const }))
      );

      if (!estimate) {
        results.push({ input: item, status: 'no_estimate' });
        continue;
      }

      await supabase.from('price_estimates').upsert(
        {
          product_id: product.id,
          owner_id: ownerId,
          system_quick_sale: estimate.quickSale,
          system_expected_sale: estimate.expected,
          system_optimistic_sale: estimate.optimistic,
          system_confidence: estimate.confidence,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
      );

      const { bidResult, flip } = computeSnapshot(
        { expectedResalePrice: estimate.expected, compConfidence: estimate.confidence, condition: (item.condition as any) ?? 'like_new' },
        settingsRow,
        pickupCostOverride != null ? { pickupCost: pickupCostOverride } : undefined
      );

      await supabase.from('watchlist').upsert(
        {
          owner_id: ownerId,
          product_id: product.id,
          status: 'watching',
          max_recommended_bid: bidResult.maxHammerBid,
          true_acquisition_cost_at_max: bidResult.trueAcquisitionCostAtMax,
          expected_profit: bidResult.expectedProfitAtMax,
          expected_roi_pct: bidResult.expectedRoiPctAtMax,
          pickup_cost_override: pickupCostOverride ?? null,
          flip_score: flip.score,
          flip_score_reasons: flip.reasons,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id,product_id' }
      );

      results.push({ input: item, status: 'added', flipScore: flip.score, maxBid: bidResult.maxHammerBid });
    } catch (e: any) {
      results.push({ input: item, status: 'error', error: e.message });
    }
  }

  return results;
}

// Extension calls this with a Bearer token (no browser session available).
export async function POST(req: NextRequest) {
  const ownerId = await getOwnerFromToken(req);
  if (!ownerId) return NextResponse.json({ error: 'Invalid or missing API token' }, { status: 401 });

  const { items, pickup_cost_override } = await req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
  }
  if (items.length > 100) {
    return NextResponse.json({ error: 'Max 100 items per batch' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const results = await processBulkItems(items, ownerId, supabase, pickup_cost_override);
  return NextResponse.json({ results });
}

// The web app's /bulk-add page calls this instead, under PUT, using the normal
// authenticated browser session (RLS-scoped client, no service role needed).
export async function PUT(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { items, pickup_cost_override } = await req.json();
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
  }
  if (items.length > 100) {
    return NextResponse.json({ error: 'Max 100 items per batch' }, { status: 400 });
  }

  const results = await processBulkItems(items, user.id, supabase, pickup_cost_override);
  return NextResponse.json({ results });
}
