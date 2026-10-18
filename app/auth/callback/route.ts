import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth / e-mail confirmation landing.
 *
 * Google and Facebook both come back here with an auth `code` (PKCE) which we
 * exchange for a real session cookie before forwarding the shopper on. Provider
 * denials and expired codes arrive as `error` / `error_code` query params
 * instead, so those are surfaced on `/login` rather than swallowed.
 *
 * Password-recovery links also land here. Depending on the project's mail
 * template they arrive either as a PKCE `code` (handled above) or as a
 * `token_hash` + `type=recovery` pair, which is verified with `verifyOtp`.
 */

/**
 * Only ever redirect to an app-relative path. Guards against `//evil.com` (a
 * protocol-relative URL) and backslash tricks that browsers normalise to `/`.
 */
function safeNext(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

/** A failed recovery link is better retried from the request screen. */
function errorScreen(next: string): string {
  return next.startsWith('/reset-password') ? '/forgot-password' : '/login';
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const otpType = searchParams.get('type');
  const next = safeNext(searchParams.get('redirectTo') ?? searchParams.get('next'));
  const error = searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  const errorDescription = searchParams.get('error_description');

  const supabase = createClient();

  if (error || errorCode || errorDescription) {
    const reason = errorCode ?? error ?? 'auth-callback-failed';
    return NextResponse.redirect(
      `${origin}${errorScreen(next)}?error=${encodeURIComponent(reason)}`,
    );
  }

  // PKCE flow: the provider (or GoTrue) handed us a one-time code.
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // E-mail OTP flow: `token_hash` + `type` (recovery, invite, email_change…).
  if (tokenHash && otpType) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: otpType as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!verifyError) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${errorScreen(next)}?error=auth-callback-failed`);
}
