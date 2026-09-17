import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getEbayAuthUrl } from '@/lib/ebay-oauth';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'));

  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_REDIRECT_URI) {
    return NextResponse.json(
      { error: 'EBAY_CLIENT_ID and EBAY_REDIRECT_URI must be set on the server before connecting eBay.' },
      { status: 500 }
    );
  }

  // `state` here is a CSRF nonce only, not identity — the callback re-checks
  // the caller's actual Supabase session cookie rather than trusting a value
  // that came back from eBay's redirect, which anyone could tamper with.
  const nonce = randomBytes(16).toString('hex');
  cookies().set('ebay_oauth_nonce', nonce, { httpOnly: true, secure: true, maxAge: 600, path: '/' });

  return NextResponse.redirect(getEbayAuthUrl(nonce));
}

