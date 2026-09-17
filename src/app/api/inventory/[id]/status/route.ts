import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ALLOWED = [
  'awaiting_pickup',
  'picked_up',
  'inspecting',
  'ready_to_list',
  'listed',
  'pending_sale',
  'sold',
  'returned',
  'problem',
];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { status, publish_to_store, storage_location } = await req.json();

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (status) {
    if (!ALLOWED.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    update.status = status;
    if (status === 'picked_up') update.picked_up_at = new Date().toISOString();
  }
  if (typeof publish_to_store === 'boolean') update.publish_to_store = publish_to_store;
  if (storage_location !== undefined) update.storage_location = storage_location;

  const { data, error } = await supabase.from('inventory').update(update).eq('id', params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inventory: data });
}
