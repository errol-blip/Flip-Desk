import { NextRequest, NextResponse } from 'next/server';
import { getActiveAdapter } from '@/lib/source-adapters';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { url } = await req.json();
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'A product URL is required.' }, { status: 400 });
  }

  const adapter = getActiveAdapter();
  const result = await adapter.fetchProductData(url);

  return NextResponse.json(result);
}
