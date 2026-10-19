import { NextResponse } from 'next/server';
import { serverAuthCallbackUrl } from '@/lib/auth-url';
import { isPhoneAliasEmail, normalizeBdPhone } from '@/lib/phone';
import { lookupAccountByPhone } from '@/lib/phone-lookup';
import { createAnonClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Password recovery for a **mobile-number** account.
 *
 * Email accounts never reach this route — the forgot-password form hands their
 * address straight to `resetPasswordForEmail` in the browser. A number cannot do
 * that, because the address that has to be emailed is not the one the shopper
 * typed: it is whatever recovery e-mail they linked, which only the service role
 * can look up.
 *
 * Answers:
 *   `sent`              a reset link went to the linked recovery address
 *   `no-recovery-email` the number has no account, or its account still signs in
 *                       under the generated alias — i.e. nothing to email
 *   `rate-limited`      GoTrue's own sender throttle said no
 *   `unavailable`       the service-role key is not configured (dev)
 *
 * `no-recovery-email` is returned for both "no such number" and "account with no
 * link", so this endpoint cannot be used to discover which numbers are
 * registered. The recovery address itself is never echoed back.
 */

/* A per-instance speed bump. It is not a real rate limiter — serverless
 * instances are ephemeral and multiple — but it stops a single client hammering
 * the sender, and GoTrue throttles the rest. */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function throttled(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 500) hits.clear();
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  let body: { phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: 'invalid' }, { status: 400 });
  }

  const canonical = typeof body.phone === 'string' ? normalizeBdPhone(body.phone) : null;
  if (!canonical) return NextResponse.json({ status: 'invalid' }, { status: 400 });

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local';

  if (throttled(`${ip}:${canonical}`)) {
    return NextResponse.json({ status: 'rate-limited' }, { status: 429 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  }

  const account = await lookupAccountByPhone(canonical).catch(() => null);
  const email =
    account?.email && !isPhoneAliasEmail(account.email) ? account.email.trim() : null;

  if (!email) return NextResponse.json({ status: 'no-recovery-email' });

  const redirectTo = serverAuthCallbackUrl(request.url, '/reset-password');
  const { error } = await createAnonClient().auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    if (/rate limit|too many/i.test(error.message)) {
      return NextResponse.json({ status: 'rate-limited' }, { status: 429 });
    }
    return NextResponse.json({ status: 'failed' }, { status: 500 });
  }

  return NextResponse.json({ status: 'sent' });
}
