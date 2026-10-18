import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on everything except Next internals, static assets, and the auth
     * callback, so the auth session is refreshed on every navigation.
     *
     * `/auth/callback` is excluded deliberately. It performs its own PKCE
     * exchange and writes the session cookies itself, and letting this
     * middleware call `getUser()` on the same request means two writers for one
     * cookie: a stale token that fails validation gets cleared by the
     * middleware while the route handler is still setting the fresh session.
     * That race is an intermittent "login worked but I am still signed out"
     * inside in-app browsers, where a stale cookie is the norm.
     */
    '/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
  ],
};
