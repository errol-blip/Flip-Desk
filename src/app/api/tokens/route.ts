import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateToken } from '@/lib/auth-token';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('api_tokens')
    .select('id, name, last_used_at, created_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tokens: data });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name } = await req.json().catch(() => ({ name: undefined }));
  const { token, hash } = generateToken();

  const { error } = await supabase.from('api_tokens').insert({
    owner_id: user.id,
    name: name || 'Chrome Extension',
    token_hash: hash,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The plaintext token is returned exactly once — it is never stored or
  // retrievable again after this response, only its hash is kept.
  return NextResponse.json({ token });
}
