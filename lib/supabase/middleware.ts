import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@/lib/types';

/**
 * Hard-gated areas. `/checkout` is here because an order must belong to an
 * account: the RPC refuses anonymous callers and the page itself refuses to
 * render the form, so this redirect is the *first* of three layers.
 *
 * `/orders` stays public because guests must be able to track an order placed
 * before checkout became account-only — those pages authorise themselves through
 * the `track_order` SQL function.
 *
 * A signed-in *operator* is deliberately not redirected away from `/checkout`
 * here: they are authenticated, and the page is the right place to explain that
 * staff accounts cannot buy — it renders the notice instead of the form, right
 * where they were heading.
 */
const PROTECTED_PREFIXES = ['/admin', '/account', '/checkout'];

const AUTH_ROUTES = ['/login', '/register'];

/**
 * The public storefront home. Staff do not shop, so this is the one storefront
 * route that is *re-routed* rather than merely gated: an admin or operator who
 * lands on `/` — the logo, a bookmark, the browser back button — is handed to the
 * console instead of a shop they cannot buy from.
 *
 * Only `/`. The rest of the catalogue stays reachable, which is what keeps
 * "edit a product, then look at it" alive for the people doing the editing.
 */
const STOREFRONT_HOME = '/';
const CONSOLE_HOME = '/admin';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

function matchesAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The middleware's copy of `isStaffRole()` from `lib/utils` — kept local so the
 *  edge bundle stays dependency-free. */
function isStaff(role: string | null | undefined) {
  return role === 'admin' || role === 'operator';
}

/**
 * A blocked account must not keep its session: clearing the `sb-…-auth-token`
 * cookies is what lets `/login?error=account-disabled` actually render its
 * message instead of bouncing the still-signed-in user straight back out.
 */
function signedOutRedirect(request: NextRequest, pathname: string, search: string) {
  const response = redirectTo(request, pathname, search);
  request.cookies.getAll().forEach((cookie) => {
    if (cookie.name.startsWith('sb-')) response.cookies.delete(cookie.name);
  });
  return response;
}

/** Plain redirect — session cookies are preserved. */
function redirectTo(request: NextRequest, pathname: string, search = '') {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = search;
  return NextResponse.redirect(url);
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the JWT with Supabase Auth. Do not use
  // getSession() here — it trusts the cookie contents.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isProtected = matchesAny(pathname, PROTECTED_PREFIXES);
  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  const isStorefrontHome = pathname === STOREFRONT_HOME;

  // A session cookie that failed to validate is NOT the same as "signed out".
  // Bouncing that request to /login would turn a transient auth-server hiccup
  // into a logout loop for a legitimate admin, so let it through and let the
  // route's own server-side guard fail closed with a real explanation.
  const hasSessionCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));

  if (!user && isProtected && !hasSessionCookie) {
    return redirectTo(request, '/login', `?redirectTo=${encodeURIComponent(pathname + search)}`);
  }

  // One indexed read serves every role/state decision below: the blocked-account
  // check, the staff gate, and the "which home page is yours" redirect. Only the
  // routes that actually branch need it — browsing the catalogue stays
  // query-free, for signed-out and signed-in shoppers alike.
  if (user && (isProtected || isAuthRoute || isStorefrontHome)) {
    const withFlag = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    // `is_active` arrives with migrations 0008/0009. Until they are applied that
    // SELECT fails with "column does not exist"; fall back to the role alone so
    // the staff gate still works on an older database (the account-state gate and
    // the users console simply stay dormant until the SQL is in).
    const ready = withFlag.error
      ? await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      : withFlag;

    const profile = ready.data as { role: string; is_active?: boolean } | null;

    // We only act on a *positive* read. If the lookup itself failed, the route's
    // own server-side guard reports it — discarding the user's session because
    // the backend hiccuped used to make a database problem look like a login
    // problem.
    if (!ready.error) {
      // Blocked account (admin_set_user_active): keep browsing, lose the session.
      // Enforced only where an account is actually required, so a blocked shopper
      // can still look around the catalogue as a guest.
      if (isProtected && profile && profile.is_active === false) {
        return signedOutRedirect(request, '/login', '?error=account-disabled');
      }

      // A blocked staff member is *not* staff — `is_staff()` in SQL requires
      // `is_active`, so parking them in a console that would immediately refuse
      // them is pointless. (They are already signed out by the branch above.)
      const staff = isStaff(profile?.role ?? null) && profile?.is_active !== false;

      // Staff do not shop: the storefront home belongs to customers, so anyone
      // running the shop is handed to the console instead.
      if (isStorefrontHome && staff) {
        return redirectTo(request, CONSOLE_HOME);
      }

      // Every `/admin` route is staff-level: an operator opens the whole console,
      // the users directory included, and may add customer accounts. What an
      // operator must not do — change a role, block or delete an account — is
      // refused in SQL and hidden in the UI, never gated by a route, so there is
      // nothing else to branch on here.
      if (pathname.startsWith('/admin') && !staff) {
        return redirectTo(request, '/', '?error=admin-only');
      }

      // Somebody who is already signed in has no business on /login or /register.
      // Staff go straight to the console so the sign-in detour costs no second
      // hop through the storefront.
      if (isAuthRoute) {
        return redirectTo(
          request,
          staff ? CONSOLE_HOME : pathname === '/register' ? '/orders' : '/',
        );
      }
    }
  }

  return response;
}
