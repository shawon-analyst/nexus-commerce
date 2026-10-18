import { SITE_URL } from '@/lib/seo';

/**
 * The absolute `/auth/callback` URL Supabase should send the browser back to.
 *
 * Every auth surface funnels through `/auth/callback` — Google/Facebook OAuth,
 * the sign-up confirmation link and the password-reset link — so they all have
 * to agree on one URL, and that URL has to be present in Supabase's
 * **Authentication → URL Configuration → Redirect URLs** allow-list. Supabase
 * silently ignores a `redirectTo` it does not recognise and falls back to the
 * project's *Site URL*, which is the classic "stuck on a blank page" symptom.
 *
 * Priority:
 *   1. `NEXT_PUBLIC_SITE_URL` when it is a real (non-localhost) origin — this is
 *      the value that is allow-listed, so it also makes preview deployments and
 *      alternate hostnames land somewhere that works.
 *   2. `window.location.origin` — correct for local development and for any host
 *      that has not been configured, so the flow never hard-codes `localhost`.
 *
 * Client-only: it reads `window`.
 */
export function authCallbackUrl(redirectTo = '/'): string {
  const configuredToRealOrigin =
    /^https?:\/\//i.test(SITE_URL) && !/localhost|127\.0\.0\.1/i.test(SITE_URL);

  const origin = configuredToRealOrigin
    ? SITE_URL
    : typeof window !== 'undefined'
      ? window.location.origin
      : SITE_URL;

  const url = new URL('/auth/callback', origin);

  /*
   * The default landing (`/`) leaves the query string off entirely, so the value
   * handed to Supabase is byte-identical to the literal
   * `https://<origin>/auth/callback`. That matters twice over: Supabase's
   * **Redirect URLs** list, and the OAuth provider's own allowed redirect URI,
   * can then be satisfied by an exact-string entry instead of requiring everyone
   * to remember the `/**` glob. `?redirectTo=%2F` is equivalent at runtime —
   * the callback route already falls back to `/` when the parameter is absent.
   *
   * Anything deeper (`/checkout`, `/reset-password`, …) still travels as a
   * normal query parameter, because the route has to know where to send them.
   */
  if (redirectTo && redirectTo !== '/') url.searchParams.set('redirectTo', redirectTo);
  return url.toString();
}
