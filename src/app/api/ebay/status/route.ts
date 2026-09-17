import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase.from('ebay_accounts').select('ebay_user_id, connected_at').eq('owner_id', user.id).maybeSingle();
  return NextResponse.json({ connected: !!data, connectedAt: data?.connected_at ?? null });
}
