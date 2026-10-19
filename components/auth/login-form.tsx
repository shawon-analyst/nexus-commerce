'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Info, LogIn, Mail, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { AuthDivider } from '@/components/auth/auth-divider';
import { GoogleSignInButton } from '@/components/auth/google-button';
import { IdentifierTabs } from '@/components/auth/identifier-tabs';
import { resolveSignInIdentifier, type IdentifierMode } from '@/lib/phone';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError, isStaffRole } from '@/lib/utils';

/**
 * Sign in with Google, an email address, or a mobile number.
 *
 * The mobile tab is *not* an SMS flow: the number is normalised to one canonical
 * form and mapped onto the email identity Supabase Auth already stores
 * (`lib/phone.ts`). Nothing is sent, nothing is charged, and the shopper keeps a
 * single password whichever tab they registered through.
 *
 * Both tabs end in the same `signInWithPassword` call, so there is exactly one
 * place that can succeed or fail.
 */
export function LoginForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<IdentifierMode>('email');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const typed = mode === 'email' ? email : phone;

  /**
   * Finish a mobile sign-in on the server, when the ordinary alias attempt failed.
   *
   * Returns `true` when the server signed the browser in — the page is already
   * navigating by then — and `false` to let the caller show its ordinary error.
   *
   * The navigation is a real one, not `router.push`: the session was written as a
   * response cookie this browser client never held, so the document has to be
   * re-fetched before the auth provider and the header agree someone is signed in.
   */
  async function signInWithServerFallback(
    phone: string,
    password: string,
    destination: string,
  ): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/phone-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, redirectTo: destination }),
      });

      if (!response.ok) return false;

      const payload = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
      const next = payload?.redirectTo;
      window.location.assign(
        typeof next === 'string' && next.startsWith('/') ? next : destination,
      );
      return true;
    } catch {
      return false;
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;

    // One validator for both tabs: it returns the address Auth should see, or a
    // sentence explaining what is wrong with what was typed.
    const resolved = resolveSignInIdentifier(mode, typed);
    if (!resolved.ok) {
      toast.error('Check your details', { description: resolved.error });
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: resolved.email,
        password,
      });

      if (error) {
        /*
         * The one failure a mobile number can come back from.
         *
         * Linking a recovery e-mail replaces the generated `…@phone.…` alias as
         * the account's auth address, so the attempt above — which sends the
         * alias — stops matching. `/api/auth/phone-signin` resolves the number to
         * whatever address Auth now holds and finishes the sign-in on the server,
         * where the service-role key lives. Only "invalid credentials" is retried:
         * a network failure is not worth a second round trip.
         */
        if (mode === 'phone' && resolved.phone && /invalid login credentials/i.test(error.message)) {
          const recovered = await signInWithServerFallback(resolved.phone, password, redirectTo);
          if (recovered) return;
        }

        toast.error('Sign in failed', { description: humanizeError(error) });
        return;
      }

      /*
       * Staff (admin *or* operator) should land in the console rather than on the
       * storefront home page — but never override an explicit ?redirectTo=.
       */
      let destination = redirectTo;
      if (redirectTo === '/' && data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        if (isStaffRole(profile?.role)) destination = '/admin';
      }

      toast.success('Welcome back!');
      router.push(destination);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <GoogleSignInButton redirectTo={redirectTo} disabled={loading} />

      <AuthDivider label="or sign in with" />

      <IdentifierTabs value={mode} onChange={setMode} disabled={loading} />

      {mode === 'email' ? (
        <div className="grid gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              className="pl-9"
              required
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="login-phone">Mobile number</Label>
          <div className="relative">
            <Smartphone
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="login-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="01712 345678"
              autoComplete="tel"
              className="pl-9"
              required
            />
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="login-password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="login-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          required
        />
      </div>

      {/*
       * A mobile-only account has no mailbox of its own, so there is no recovery
       * address to send a reset link to until the shopper adds one on their
       * profile. Saying so here is kinder than letting them discover it on the
       * help page.
       */}
      {mode === 'phone' && (
        <p className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            A mobile number signs in with this password. Add a recovery email on your profile and
            we can also e-mail you a reset link — without one, support has to reset it for you.
          </span>
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        <LogIn className="h-4 w-4" /> Sign in
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        No account yet?{' '}
        <Link
          href={`/register?redirectTo=${encodeURIComponent(redirectTo)}${
            mode === 'phone' ? '&mode=phone' : ''
          }`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Create one
        </Link>
      </p>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        By signing in you agree to our{' '}
        <Link href="/terms" prefetch className="underline underline-offset-2 hover:text-foreground">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" prefetch className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
