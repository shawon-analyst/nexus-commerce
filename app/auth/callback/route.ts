import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth / e-mail confirmation landing.
 *
 * Google and Facebook both come back here with an auth `code` (PKCE) which we
 * exchange for a real session cookie before forwarding the shopper on. Provider
 * denials and expired codes arrive as `error` / `error_code` query params
 * instead, so those are surfaced on `/login` rather than swallowed.
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

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('redirectTo'));
  const error = searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  const errorDescription = searchParams.get('error_description');

  if (error || errorCode || errorDescription) {
    const code = errorCode ?? error ?? 'auth-callback-failed';
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(code)}`);
  }

  if (code) {
    const supabase = createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`);
}
