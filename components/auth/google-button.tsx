'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { authCallbackUrl } from '@/lib/auth-url';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError } from '@/lib/utils';

/**
 * Sign-in with Google (the one remaining social provider).
 *
 * `signInWithOAuth` navigates the whole tab — there is no popup — which is the
 * only shape that survives an in-app browser. `redirectTo` must be an absolute
 * URL Supabase has allow-listed or GoTrue falls back to the Site URL, which is
 * how a social sign-in lands on a blank page.
 *
 * `queryParams: { prompt: 'select_account' }` forces Google's account-chooser on
 * every tap so the shopper never silently reuses a stranger's session (or finds
 * that the button "did nothing" because their existing session was reused).
 */
export function GoogleSignInButton({
  redirectTo = '/',
  disabled = false,
}: {
  redirectTo?: string;
  disabled?: boolean;
}) {
  const supabase = getSupabaseBrowserClient();
  const [pending, setPending] = React.useState(false);

  async function startSignIn() {
    setPending(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authCallbackUrl(redirectTo),
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      setPending(false);
      toast.error(`Could not continue with Google`, {
        description: humanizeError(error),
      });
    }
    // On success the browser is already navigating away — keep the spinner up.
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full justify-center gap-2.5 font-medium text-foreground"
      disabled={disabled || pending}
      onClick={() => void startSignIn()}
    >
      <GoogleGlyph className="h-4 w-4" />
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue with Google'}
    </Button>
  );
}

/* ----------------------------------------------------------- Google mark --- */

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.11A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56V6.61H1.28a12 12 0 0 0 0 10.78l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.61l4.01 3.11C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}
