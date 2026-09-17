import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client. This BYPASSES Row Level Security entirely, so every
 * query made with it must manually filter by owner_id in application code.
 * Only used by the token-authenticated extension routes (src/app/api/extension/*)
 * because a Chrome extension calling a different origin has no Supabase
 * session cookie to authenticate with normally.
 *
 * Never import this into any client-side code or any route that doesn't
 * itself verify the caller via `getOwnerFromToken`.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
