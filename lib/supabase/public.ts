import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';

/**
 * Cookie-free Supabase client for **public catalogue reads** (products,
 * categories, storefront counters).
 *
 * Two reasons it exists:
 *  1. `unstable_cache` runs outside the request scope, so it must never touch
 *     `cookies()` — a request-scoped client would either throw or poison the
 *     shared cache with one visitor's session.
 *  2. Catalogue data is identical for every visitor, so skipping cookie parsing
 *     and session refresh makes those reads measurably cheaper.
 *
 * RLS still applies: this is the anon key, so only rows the public policies
 * expose (`products.is_active`, all categories) come back.
 */
export function createPublicClient() {
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        // Next patches global fetch; opt out of its cache so `unstable_cache`
        // is the single, explicit caching layer.
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );
}
