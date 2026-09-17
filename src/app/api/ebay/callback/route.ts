import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { exchangeCodeForTokens } from '@/lib/ebay-oauth';

function redirectToSettings(base: string, status: 'connected' | 'error', message?: string) {
  const url = new URL('/settings', base);
  url.searchParams.set('ebay', status);
  if (message) url.searchParams.set('message', message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirectToSettings(siteUrl, 'error', 'Your session expired — please sign in and try connecting again.');

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const nonceCookie = cookies().get('ebay_oauth_nonce')?.value;

  if (!code || !state || !nonceCookie || state !== nonceCookie) {
    return redirectToSettings(siteUrl, 'error', 'The connection request could not be verified — please try again.');
  }
  cookies().delete('ebay_oauth_nonce');

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const { error } = await supabase.from('ebay_accounts').upsert(
      {
        owner_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id' }
    );

    if (error) return redirectToSettings(siteUrl, 'error', error.message);
    return redirectToSettings(siteUrl, 'connected');
  } catch (e: any) {
    return redirectToSettings(siteUrl, 'error', e.message);
  }
}
