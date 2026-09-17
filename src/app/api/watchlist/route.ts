import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import {
  calculateMaxBid,
  calculateFlipScore,
  DEFAULT_FLIP_SCORE_WEIGHTS,
  type FeeSettings,
} from '@/lib/calculations';

const WatchlistInput = z.object({
  product_id: z.string().uuid(),
  expected_resale_price: z.number().positive(),
  expected_selling_costs: z.number().min(0).default(0),
  pickup_cost_override: z.number().min(0).nullable().optional(),
  desired_min_profit: z.number().min(0).optional(),
  desired_min_roi_pct: z.number().min(0).optional(),
  comp_confidence: z.enum(['low', 'medium', 'high']).default('medium'),
  brand_desirability: z.number().min(0).max(100).nullable().optional(),
  estimated_demand: z.number().min(0).max(100).nullable().optional(),
  estimated_days_to_sell: z.number().min(0).nullable().optional(),
  is_bulky_or_shipping_difficult: z.boolean().default(false),
  requires_local_pickup: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = WatchlistInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const [{ data: settingsRow }, { data: product }] = await Promise.all([
    supabase.from('settings').select('*').eq('owner_id', user.id).maybeSingle(),
    supabase.from('products').select('*').eq('id', input.product_id).single(),
  ]);

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  // Fall back to sane defaults if the user hasn't visited Settings yet.
  // A per-item pickup/transport cost override takes precedence over the
  // global default — a treadmill and a phone case don't cost the same to move.
  const fees: FeeSettings = {
    buyerPremiumPct: Number(settingsRow?.buyer_premium_pct ?? 15),
    lotFeeFlat: Number(settingsRow?.lot_fee_flat ?? 2),
    salesTaxPct: Number(settingsRow?.sales_tax_pct ?? 7.25),
    pickupCost: input.pickup_cost_override ?? Number(settingsRow?.default_pickup_cost ?? 0),
    riskReservePct: Number(settingsRow?.default_risk_reserve_pct ?? 8),
    otherCost: 0,
  };

  const minProfit = input.desired_min_profit ?? Number(settingsRow?.default_min_profit ?? 50);
  const minRoiPct = input.desired_min_roi_pct ?? Number(settingsRow?.default_min_roi_pct ?? 40);

  const bidResult = calculateMaxBid({
    expectedResalePrice: input.expected_resale_price,
    desiredMinProfit: minProfit,
    desiredMinRoiPct: minRoiPct,
    expectedSellingCosts: input.expected_selling_costs,
    fees,
  });

  const weights = settingsRow
    ? {
        profit: Number(settingsRow.weight_profit),
        roi: Number(settingsRow.weight_roi),
        compConfidence: Number(settingsRow.weight_comp_confidence),
        brand: Number(settingsRow.weight_brand),
        condition: Number(settingsRow.weight_condition),
        demand: Number(settingsRow.weight_demand),
        daysToSell: Number(settingsRow.weight_days_to_sell),
        logistics: Number(settingsRow.weight_logistics),
        capital: Number(settingsRow.weight_capital),
      }
    : DEFAULT_FLIP_SCORE_WEIGHTS;

  const flip = calculateFlipScore({
    expectedProfit: bidResult.expectedProfitAtMax,
    expectedRoiPct: bidResult.expectedRoiPctAtMax,
    compConfidence: input.comp_confidence,
    brandDesirability: input.brand_desirability,
    condition: product.condition,
    estimatedDemand: input.estimated_demand,
    estimatedDaysToSell: input.estimated_days_to_sell,
    isBulkyOrShippingDifficult: input.is_bulky_or_shipping_difficult,
    requiresLocalPickup: input.requires_local_pickup,
    trueAcquisitionCost: bidResult.trueAcquisitionCostAtMax,
    weights,
  });

  // Upsert the price estimate (manual entry acts as the override in V1, since
  // Phase 1 doesn't yet compute a system estimate from stored comparables at write time).
  await supabase.from('price_estimates').upsert(
    {
      product_id: product.id,
      owner_id: user.id,
      override_expected_sale: input.expected_resale_price,
      overridden_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'product_id' }
  );

  const { data: watchlistRow, error } = await supabase
    .from('watchlist')
    .upsert(
      {
        owner_id: user.id,
        product_id: product.id,
        status: 'watching',
        max_recommended_bid: bidResult.maxHammerBid,
        true_acquisition_cost_at_max: bidResult.trueAcquisitionCostAtMax,
        expected_profit: bidResult.expectedProfitAtMax,
        expected_roi_pct: bidResult.expectedRoiPctAtMax,
        pickup_cost_override: input.pickup_cost_override ?? null,
        expected_selling_cost: input.expected_selling_costs,
        flip_score: flip.score,
        flip_score_reasons: flip.reasons,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,product_id' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ watchlist: watchlistRow, bidResult, flip });
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('watchlist')
    .select('*, product:products(*)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ watchlist: data });
}
