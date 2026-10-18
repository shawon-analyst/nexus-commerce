import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types';

/**
 * Browser-side Supabase client.
 * Safe to call on every render — @supabase/ssr memoises the instance per tab.
 * Uses the publishable/anon key, therefore every request is constrained by RLS.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let cached: ReturnType<typeof createClient> | undefined;

/** Singleton accessor for use inside event handlers / hooks. */
export function getSupabaseBrowserClient() {
  if (!cached) cached = createClient();
  return cached;
}
