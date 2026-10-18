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
 *
 * Three details exist purely for in-app browsers (Facebook, Facebook Lite,
 * Instagram, Messenger) and for WebViews generally, which are allowed to replay
 * a request, drop a cookie they dislike, or refuse a popup outright:
 *
 *  1. Every response is `no-store`, so a WebView's back/forward cache cannot
 *     replay a `code` that has already been spent.
 *  2. A replay of this URL — the code consumed by the first hit — falls through
 *     to "is there a session *now*?" and forwards the shopper. Treating that as
 *     a failure is what makes a successful login look broken in an in-app
 *     browser, which often fires the callback twice.
 *  3. A missing PKCE verifier cookie gets its own error code, so the sign-in
 *     screen can tell the shopper to reopen the page in a normal browser
 *     instead of showing a generic "link expired".
 *
 * `/auth/callback` is also excluded from the session-refresh middleware (see
 * `middleware.ts`) so exactly one writer touches the auth cookies here.
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

/** Never cached: a 302 that mints a session must not be replayable. */
function redirect(to: string) {
  return NextResponse.redirect(to, { headers: { 'Cache-Control': 'no-store' } });
}

/** A PKCE failure means the verifier cookie never made it back to us. */
function isVerifierError(message: string) {
  return /code verifier|pkce/i.test(message);
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
    return redirect(`${origin}${errorScreen(next)}?error=${encodeURIComponent(reason)}`);
  }

  /** Why the exchange failed, if it did — classified only once we know. */
  let exchangeFailure: string | null = null;

  // PKCE flow: the provider (or GoTrue) handed us a one-time code.
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return redirect(`${origin}${next}`);
    }
    exchangeFailure = exchangeError.message;
  }

  // E-mail OTP flow: `token_hash` + `type` (recovery, invite, email_change…).
  if (tokenHash && otpType) {
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: otpType as EmailOtpType,
      token_hash: tokenHash,
    });
    if (!verifyError) {
      return redirect(`${origin}${next}`);
    }
  }

  /*
   * Ask the only question that matters before blaming anything: is the shopper
   * signed in *now*?
   *
   * This is the check that makes a replay safe. A WebView commonly fires the
   * callback twice: the first hit exchanges the code and writes the session
   * cookie, the second arrives with an already-spent code and no verifier. Done
   * the other way round — classifying the failure first — a successfully
   * signed-in shopper gets told their browser blocked the cookie. It also
   * covers the browser client having completed the handshake on its own.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    return redirect(`${origin}${next}`);
  }

  // Genuinely not signed in: the code was fine but the matching verifier never
  // made it back, which is almost always an in-app browser refusing the cookie.
  if (exchangeFailure && isVerifierError(exchangeFailure)) {
    return redirect(`${origin}${errorScreen(next)}?error=auth-code-verifier-missing`);
  }

  return redirect(`${origin}${errorScreen(next)}?error=auth-callback-failed`);
}
