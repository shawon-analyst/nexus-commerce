'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Info, LogIn, Mail, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const typed = mode === 'email' ? email : phone;

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
        <div className="relative">
          <Input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-accent"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/*
       * A mobile-only account has no mailbox, so there is no recovery address to
       * send a reset link to. Saying so here is far kinder than letting the
       * shopper discover it on the help page.
       */}
      {mode === 'phone' && (
        <p className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            A mobile number signs in with this password only — we cannot email a reset link to
            it. If you forget it, contact support and we will help you back in.
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
