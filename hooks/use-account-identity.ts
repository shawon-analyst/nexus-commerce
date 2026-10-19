'use client';

import * as React from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type AccountIdentity = {
  /** The address Supabase Auth holds — the alias, for a mobile account. */
  email: string | null;
  /**
   * True when the account signs in with an e-mail and a password.
   *
   * `app_metadata.provider` is `email` for anything created by sign-up, the
   * mobile flow or the admin console, and `google` for an OAuth-only account —
   * which has no password to confirm and no reason to manage a recovery address.
   */
  hasPassword: boolean;
};

/**
 * The signed-in account's own auth identity, read once per page load.
 *
 * Both security cards on `/account` need the same two facts, and `auth.getUser()`
 * is a network round trip. The in-flight promise is memoised at module scope so
 * the second card joins the first one's request instead of making its own.
 */
let inFlight: Promise<AccountIdentity> | null = null;

function load(): Promise<AccountIdentity> {
  if (!inFlight) {
    inFlight = getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        const provider = (data.user?.app_metadata as { provider?: string } | undefined)?.provider;
        return {
          email: data.user?.email ?? null,
          hasPassword: provider === 'email',
        } satisfies AccountIdentity;
      })
      // A failed read must not wedge the page: treat it as "no password to
      // confirm", which renders the safer form rather than a broken one.
      .catch(() => ({ email: null, hasPassword: false }) satisfies AccountIdentity);
  }
  return inFlight;
}

export function useAccountIdentity(): AccountIdentity | null {
  const [identity, setIdentity] = React.useState<AccountIdentity | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void load().then((value) => {
      if (!cancelled) setIdentity(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return identity;
}
