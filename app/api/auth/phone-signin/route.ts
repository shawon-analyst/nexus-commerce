import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@/lib/types';
import { isPhoneAliasEmail, normalizeBdPhone, toPhoneAlias } from '@/lib/phone';
import { lookupAccountByPhone } from '@/lib/phone-lookup';
import { isStaffRole } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/** Only ever return the browser to an app-relative path. */
function safeNext(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Mobile sign-in, completed on the server.
 *
 * The Mobile tab tries the ordinary alias sign-in first, in the browser, and only
 * calls this route when that fails. That happens for exactly one reason: the
 * shopper has since **linked a recovery e-mail**, which replaced the generated
 * `…@phone.…` alias as the account's auth address (see
 * `/api/account/recovery-email`). Without this route their mobile number would
 * silently stop working — the number would resolve to an address GoTrue no longer
 * holds.
 *
 * The point of doing it here is that resolving the new address needs the
 * service-role key, and the address itself never has to cross back to the
 * browser: the password is handed to GoTrue, and only the *session cookie* and a
 * destination come back.
 *
 * Failure is deliberately uniform. A wrong password, an unknown number and a
 * number GoTrue refuses all answer `401 INVALID_CREDENTIALS`, so the endpoint
 * cannot be used to test which numbers have accounts.
 */
export async function POST(request: Request) {
  let body: { phone?: unknown; password?: unknown; redirectTo?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, 'INVALID_JSON');
  }

  const canonical = typeof body.phone === 'string' ? normalizeBdPhone(body.phone) : null;
  const password = typeof body.password === 'string' ? body.password : '';

  if (!canonical || !password) return fail(400, 'INVALID_PHONE');

  /*
   * A cookie-bound anon client, exactly like the rest of the app — but the
   * cookies it writes are collected and attached to the response by hand below.
   * That keeps the session in one writer's hands (the same reasoning that keeps
   * `/auth/callback` out of the refresh middleware).
   */
  const cookieStore = cookies();
  const pendingCookies: CookieToSet[] = [];

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach((cookie) => pendingCookies.push(cookie));
        },
      },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    },
  );

  // 1. The ordinary case — a mobile-registered account still lives under its alias.
  let result = await supabase.auth.signInWithPassword({
    email: toPhoneAlias(canonical),
    password,
  });

  // 2. The linked-recovery-email case — resolve the replacement address with the
  //    service role and retry. It never leaves the server.
  if (result.error && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const account = await lookupAccountByPhone(canonical);
      if (account && account.email && !isPhoneAliasEmail(account.email)) {
        result = await supabase.auth.signInWithPassword({ email: account.email, password });
      }
    } catch {
      // fall through to the uniform failure below
    }
  }

  if (result.error || !result.data.user) return fail(401, 'INVALID_CREDENTIALS');

  const userId = result.data.user.id;
  const requested = safeNext(body.redirectTo);
  let destination = requested;

  // Same rule as the client-side flow: staff who asked for the storefront home
  // belong in the console. An explicit ?redirectTo= is never overridden.
  if (requested === '/') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (isStaffRole(profile?.role)) destination = '/admin';
  }

  const response = NextResponse.json({ ok: true, redirectTo: destination });
  pendingCookies.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options),
  );
  return response;
}
