import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { calculateTrueAcquisitionCost, type FeeSettings } from '@/lib/calculations';

const WinInput = z.object({
  winning_hammer_price: z.number().positive(),
  actual_taxes_fees: z.number().min(0).nullable().optional(),
  pickup_location_id: z.string().uuid().nullable().optional(),
  pickup_deadline: z.string().nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = WinInput.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;

  const { data: watchlistRow, error: wlError } = await supabase
    .from('watchlist')
    .select('*, product:products(*)')
    .eq('id', params.id)
    .single();

  if (wlError || !watchlistRow) return NextResponse.json({ error: 'Watchlist item not found' }, { status: 404 });

  const [{ data: settingsRow }, { data: priceEstimate }] = await Promise.all([
    supabase.from('settings').select('*').eq('owner_id', user.id).maybeSingle(),
    supabase.from('price_estimates').select('*').eq('product_id', watchlistRow.product_id).maybeSingle(),
  ]);

  const expectedResale =
    priceEstimate?.override_expected_sale ?? priceEstimate?.system_expected_sale ?? 0;

  const pickupCost = watchlistRow.pickup_cost_override ?? Number(settingsRow?.default_pickup_cost ?? 0);

  let trueAcquisitionCost: number;
  let buyerPremium = 0;
  let salesTax = 0;
  let lotFee = Number(settingsRow?.lot_fee_flat ?? 2);

  if (input.actual_taxes_fees != null) {
    // User gave us the actual invoiced total for premium+lot fee+tax combined.
    trueAcquisitionCost = input.winning_hammer_price + input.actual_taxes_fees + pickupCost;
  } else {
    const fees: FeeSettings = {
      buyerPremiumPct: Number(settingsRow?.buyer_premium_pct ?? 15),
      lotFeeFlat: Number(settingsRow?.lot_fee_flat ?? 2),
      salesTaxPct: Number(settingsRow?.sales_tax_pct ?? 7.25),
      pickupCost,
      riskReservePct: Number(settingsRow?.default_risk_reserve_pct ?? 8),
      otherCost: 0,
    };
    const breakdown = calculateTrueAcquisitionCost(input.winning_hammer_price, expectedResale, fees);
    trueAcquisitionCost = breakdown.trueAcquisitionCost;
    buyerPremium = breakdown.buyerPremium;
    salesTax = breakdown.salesTax;
  }

  const { data: inventory, error: invError } = await supabase
    .from('inventory')
    .insert({
      owner_id: user.id,
      product_id: watchlistRow.product_id,
      watchlist_id: watchlistRow.id,
      status: 'awaiting_pickup',
      winning_hammer_price: input.winning_hammer_price,
      actual_buyer_premium: buyerPremium || null,
      actual_lot_fee: lotFee,
      actual_sales_tax: salesTax || null,
      actual_pickup_cost: pickupCost,
      true_acquisition_cost: trueAcquisitionCost,
      pickup_location_id: input.pickup_location_id ?? null,
      pickup_deadline: input.pickup_deadline,
    })
    .select()
    .single();

  if (invError) return NextResponse.json({ error: invError.message }, { status: 500 });

  await supabase.from('watchlist').update({ status: 'won', updated_at: new Date().toISOString() }).eq('id', params.id);

  return NextResponse.json({ inventory });
}
