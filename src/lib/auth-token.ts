import { createHash, randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { createServiceClient } from './supabase/service';

export function generateToken(): { token: string; hash: string } {
  const token = `fd_${randomBytes(24).toString('hex')}`; // "fd" = Flip Desk, easy to recognize in logs
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Verifies the `Authorization: Bearer <token>` header against stored token
 * hashes and returns the owning user's id, or null if invalid/missing.
 * Used only by routes under src/app/api/extension/*, which have no browser
 * session cookie to check instead.
 */
export async function getOwnerFromToken(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const hash = hashToken(token);
  const supabase = createServiceClient();
  const { data } = await supabase.from('api_tokens').select('id, owner_id').eq('token_hash', hash).maybeSingle();

  if (!data) return null;

  // Best-effort last-used timestamp; don't block the request if this fails.
  supabase.from('api_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {});

  return data.owner_id;
}
