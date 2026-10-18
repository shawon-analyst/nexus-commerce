import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Server Components / Route Handlers / Server Actions client.
 *
 * `cache: 'no-store'` is critical: Next 14 patches global fetch and would
 * otherwise cache Supabase REST GETs, giving shoppers stale stock counts.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — middleware already refreshed the
            // session cookie, so this can be safely ignored.
          }
        },
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );
}

/**
 * Privileged client using the service-role key. NEVER import this into a
 * Client Component. Only created when the env var is present, so the app keeps
 * working without it.
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not configured — admin-only server tasks are disabled.',
    );
  }
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
