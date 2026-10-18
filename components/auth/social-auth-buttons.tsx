'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError } from '@/lib/utils';

type OAuthProvider = 'google' | 'facebook';

/** Google's official four-colour mark. */
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

/** Facebook's blue roundel. */
function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07Z"
      />
    </svg>
  );
}

const PROVIDERS: Array<{
  id: OAuthProvider;
  label: string;
  Glyph: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'google', label: 'Continue with Google', Glyph: GoogleGlyph },
  { id: 'facebook', label: 'Continue with Facebook', Glyph: FacebookGlyph },
];

/**
 * Google / Facebook one-tap sign in.
 *
 * `signInWithOAuth` hands the browser to the provider and comes back to
 * `/auth/callback`, where the code is exchanged for a session. The provider
 * also returns the user's name and picture; `handle_new_user()` in the database
 * copies them onto the new profile row, so the header avatar is populated the
 * instant the shopper lands back on the site — no manual upload needed.
 */
export function SocialAuthButtons({
  redirectTo = '/',
  disabled = false,
}: {
  redirectTo?: string;
  disabled?: boolean;
}) {
  const [pending, setPending] = React.useState<OAuthProvider | null>(null);

  async function startSignIn(provider: OAuthProvider) {
    setPending(provider);
    try {
      const supabase = getSupabaseBrowserClient();
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('redirectTo', redirectTo);

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callback.toString(),
          // `email` is required for Facebook; Google's profile scopes are default.
          scopes: provider === 'facebook' ? 'email,public_profile' : undefined,
        },
      });

      if (error) {
        toast.error(`Could not continue with ${provider}`, {
          description: humanizeError(error),
        });
        setPending(null);
        return;
      }

      // Success means the browser is already navigating away — keep the spinner
      // up so the button does not flicker back to its idle state mid-redirect.
    } catch (error) {
      toast.error(`Could not continue with ${provider}`, { description: humanizeError(error) });
      setPending(null);
    }
  }

  return (
    <div className="grid gap-2.5">
      {PROVIDERS.map(({ id, label, Glyph }) => (
        <Button
          key={id}
          type="button"
          variant="outline"
          size="lg"
          className="w-full justify-center gap-2.5 font-medium"
          disabled={disabled || pending !== null}
          onClick={() => void startSignIn(id)}
        >
          {pending === id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Glyph className="h-4 w-4" />}
          {label}
        </Button>
      ))}
    </div>
  );
}

/** "or continue with email" rule between the social buttons and the form. */
export function AuthDivider({ label = 'or continue with email' }: { label?: string }) {
  return (
    <div className="relative py-1">
      <div aria-hidden className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-background px-3 text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}
