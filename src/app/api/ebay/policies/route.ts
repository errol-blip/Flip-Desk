import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/ebay-oauth';
import { getSellerPolicies } from '@/lib/ebay-listing';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: account } = await supabase.from('ebay_accounts').select('*').eq('owner_id', user.id).maybeSingle();
  if (!account) return NextResponse.json({ error: 'eBay account not connected' }, { status: 400 });

  try {
    const accessToken = await getValidAccessToken(account, async (newToken, expiresAt) => {
      await supabase
        .from('ebay_accounts')
        .update({ access_token: newToken, access_token_expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq('owner_id', user.id);
    });

    const policies = await getSellerPolicies(accessToken);
    return NextResponse.json(policies);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
