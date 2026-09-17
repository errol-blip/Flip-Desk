import { NextRequest, NextResponse } from 'next/server';
import { getOwnerFromToken } from '@/lib/auth-token';

export async function GET(req: NextRequest) {
  const ownerId = await getOwnerFromToken(req);
  if (!ownerId) return NextResponse.json({ ok: false, error: 'Invalid or missing API token' }, { status: 401 });
  return NextResponse.json({ ok: true });
}
