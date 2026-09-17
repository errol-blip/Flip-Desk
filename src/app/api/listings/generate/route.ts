import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateListingDraft } from '@/lib/listing-generator';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { inventory_id, platforms } = await req.json();
  if (!inventory_id) return NextResponse.json({ error: 'inventory_id is required' }, { status: 400 });

  const targetPlatforms: string[] = platforms?.length ? platforms : ['website', 'facebook_marketplace', 'ebay', 'offerup'];

  const { data: inv, error: invError } = await supabase
    .from('inventory')
    .select('*, product:products(*, brand:brands(name))')
    .eq('id', inventory_id)
    .single();

  if (invError || !inv) return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 });

  const { data: priceEstimate } = await supabase
    .from('price_estimates')
    .select('*')
    .eq('product_id', inv.product_id)
    .maybeSingle();

  const expectedResale = priceEstimate?.override_expected_sale ?? priceEstimate?.system_expected_sale ?? null;
  const quickSale = priceEstimate?.override_quick_sale ?? priceEstimate?.system_quick_sale ?? null;

  const rows = targetPlatforms.map((platform) => {
    const draft = generateListingDraft(
      inv.product,
      (inv.product as any).brand?.name ?? null,
      expectedResale,
      quickSale,
      platform as any
    );
    return {
      owner_id: user.id,
      inventory_id,
      platform,
      title: draft.title,
      short_description: draft.short_description,
      full_description: draft.full_description,
      suggested_asking_price: draft.suggested_asking_price,
      suggested_quick_sale_price: draft.suggested_quick_sale_price,
      keywords: draft.keywords,
      status: 'draft',
    };
  });

  const { data: listings, error } = await supabase.from('listings').insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('inventory').update({ status: 'ready_to_list', updated_at: new Date().toISOString() }).eq('id', inventory_id);

  return NextResponse.json({ listings });
}
