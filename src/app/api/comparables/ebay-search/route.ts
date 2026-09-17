import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchEbayComparables } from '@/lib/ebay';
import { estimateResaleValue } from '@/lib/calculations';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { product_id, upc, keywords, save } = await req.json();

  let result;
  try {
    result = await searchEbayComparables({ upc, keywords });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  if (result.comparables.length === 0) {
    return NextResponse.json({ comparables: [], searchMethod: result.searchMethod, estimate: null });
  }

  const estimate = estimateResaleValue(
    result.comparables.map((c) => ({ price: c.price, priceType: c.priceType, confidence: 'medium' as const }))
  );

  if (save && product_id) {
    await supabase.from('comparables').insert(
      result.comparables.map((c) => ({
        product_id,
        owner_id: user.id,
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

    if (estimate) {
      await supabase.from('price_estimates').upsert(
        {
          product_id,
          owner_id: user.id,
          system_quick_sale: estimate.quickSale,
          system_expected_sale: estimate.expected,
          system_optimistic_sale: estimate.optimistic,
          system_confidence: estimate.confidence,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'product_id' }
      );
    }
  }

  return NextResponse.json({ comparables: result.comparables, searchMethod: result.searchMethod, estimate });
}
