import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';
import { NO_INDEX } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in with Google, Facebook or your email to track your orders.',
  robots: NO_INDEX,
};

/** Turns the codes the OAuth callback hands back into something readable. */
function friendlyAuthError(error: string) {
  if (error === 'auth-callback-failed')
    return 'That sign-in link has expired or was already used. Please try again.';
  if (error === 'access_denied' || error === 'access_denied_denied')
    return 'You cancelled the sign-in, or the provider denied the request. Nothing was charged — try again whenever you are ready.';
  if (error === 'otp_expired')
    return 'That link has expired. Sign in again and we will send a fresh one.';
  if (error === 'server_error' || error === 'temporarily_unavailable')
    return 'The sign-in provider is having a moment. Please try again in a few seconds.';
  if (/email.*not.*confirmed/i.test(error))
    return 'That address still needs confirming. Try signing in again to trigger a fresh link.';
  return error;
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string; error?: string };
}) {
  const redirectTo = searchParams.redirectTo ?? '/';
  /** Arrived here mid-checkout: say so instead of a generic welcome. */
  const toCheckout = redirectTo.startsWith('/checkout');

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {toCheckout ? 'Sign in to check out' : 'Welcome back'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {toCheckout
            ? 'Your cart is saved and your details are ready — sign in and you will land straight back on checkout.'
            : 'Sign in to see your orders and check out faster.'}
        </p>
      </header>

      {searchParams.error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{friendlyAuthError(searchParams.error)}</span>
        </div>
      )}

      <LoginForm redirectTo={redirectTo} />
    </>
  );
}
