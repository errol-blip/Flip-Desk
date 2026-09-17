import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const ProductInput = z.object({
  source_type: z.string().default('macbid'),
  source_url: z.string().url().nullable().optional(),
  source_product_id: z.string().nullable().optional(),
  source_fetch_status: z.string().nullable().optional(),
  name: z.string().min(1, 'Product name is required'),
  brand_id: z.string().uuid().nullable().optional(),
  model_number: z.string().nullable().optional(),
  upc: z.string().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  condition: z
    .enum(['like_new', 'open_box', 'used_good', 'used_fair', 'damaged', 'incomplete', 'unknown'])
    .default('like_new'),
  description: z.string().nullable().optional(),
  image_urls: z.array(z.string()).default([]),
  retail_msrp: z.number().nullable().optional(),
  current_bid: z.number().nullable().optional(),
  auction_end_at: z.string().nullable().optional(),
  source_location_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = ProductInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: product, error } = await supabase
    .from('products')
    .insert({
      ...parsed.data,
      owner_id: user.id,
      source_retrieved_at: parsed.data.source_fetch_status ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ product });
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ products: data });
}
