import { NextRequest, NextResponse } from 'next/server';
import { getOwnerFromToken } from '@/lib/auth-token';
import { createServiceClient } from '@/lib/supabase/service';
import { computeSnapshot } from '@/lib/bid-engine';
import { searchEbayComparables } from '@/lib/ebay';
import { estimateResaleValue } from '@/lib/calculations';

export async function POST(req: NextRequest) {
  const ownerId = await getOwnerFromToken(req);
  if (!ownerId) return NextResponse.json({ error: 'Invalid or missing API token' }, { status: 401 });

  const body = await req.json();
  const { name, upc, model_number, condition, current_bid, retail_msrp, auction_end_at, source_url, image_url, expected_resale_price, pickup_cost_override } =
    body;

  if (!name) return NextResponse.json({ error: 'Product name is required' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: product, error: productError } = await supabase
    .from('products')
    .insert({
      owner_id: ownerId,
      source_type: 'macbid',
      source_url: source_url ?? null,
      upc: upc ?? null,
      model_number: model_number ?? null,
      name,
      condition: condition ?? 'like_new',
      retail_msrp: retail_msrp ?? null,
      current_bid: current_bid ?? null,
      auction_end_at: auction_end_at ?? null,
      image_urls: image_url ? [image_url] : [],
      source_fetch_status: 'success', // extension read data straight from the page the user was viewing
      source_retrieved_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (productError || !product) return NextResponse.json({ error: productError?.message ?? 'Could not save product' }, { status: 500 });

  let resalePrice = expected_resale_price ?? null;
  let compConfidence: 'low' | 'medium' | 'high' = 'low';

  if (!resalePrice) {
    try {
      const result = await searchEbayComparables({ upc, keywords: name, limit: 8 });
      if (result.comparables.length > 0) {
        await supabase.from('comparables').insert(
          result.comparables.map((c) => ({
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
          result.comparables.map((c) => ({ price: c.price, priceType: c.priceType, confidence: 'medium' as const }))
        );
        if (estimate) {
          resalePrice = estimate.expected;
          compConfidence = estimate.confidence;
        }
      }
    } catch {
      // No eBay credentials configured or search failed — proceed without an estimate.
    }
  }

  const { data: settingsRow } = await supabase.from('settings').select('*').eq('owner_id', ownerId).maybeSingle();

  if (resalePrice) {
    await supabase.from('price_estimates').upsert(
      {
        product_id: product.id,
        owner_id: ownerId,
        system_expected_sale: resalePrice,
        system_confidence: compConfidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'product_id' }
    );

    const { bidResult, flip } = computeSnapshot(
      { expectedResalePrice: resalePrice, compConfidence, condition: condition ?? 'like_new' },
      settingsRow,
      pickup_cost_override != null ? { pickupCost: pickup_cost_override } : undefined
    );

    const { data: watchlistRow } = await supabase
      .from('watchlist')
      .upsert(
        {
          owner_id: ownerId,
          product_id: product.id,
          status: 'watching',
          max_recommended_bid: bidResult.maxHammerBid,
          true_acquisition_cost_at_max: bidResult.trueAcquisitionCostAtMax,
          expected_profit: bidResult.expectedProfitAtMax,
          expected_roi_pct: bidResult.expectedRoiPctAtMax,
          pickup_cost_override: pickup_cost_override ?? null,
          flip_score: flip.score,
          flip_score_reasons: flip.reasons,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_id,product_id' }
      )
      .select()
      .single();

    return NextResponse.json({ product, watchlist: watchlistRow, flipScore: flip.score });
  }

  // No resale estimate available — still save the product and a bare watchlist
  // entry so it shows up in the app for the user to complete manually.
  const { data: watchlistRow } = await supabase
    .from('watchlist')
    .upsert(
      { owner_id: ownerId, product_id: product.id, status: 'watching', updated_at: new Date().toISOString() },
      { onConflict: 'owner_id,product_id' }
    )
    .select()
    .single();

  return NextResponse.json({ product, watchlist: watchlistRow, flipScore: null, note: 'No resale estimate found — complete it in the app.' });
}
