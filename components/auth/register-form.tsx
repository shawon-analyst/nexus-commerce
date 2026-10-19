'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Info, MailCheck, Smartphone, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthDivider } from '@/components/auth/auth-divider';
import { GoogleSignInButton } from '@/components/auth/google-button';
import { IdentifierTabs } from '@/components/auth/identifier-tabs';
import { authCallbackUrl } from '@/lib/auth-url';
import { MIN_PASSWORD_LENGTH, PASSWORD_STRENGTH_META, passwordStrength } from '@/lib/password';
import {
  formatBdPhone,
  normalizeBdPhone,
  resolveSignInIdentifier,
  type IdentifierMode,
} from '@/lib/phone';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn, humanizeError } from '@/lib/utils';

/**
 * Create an account with an email address, a mobile number, or Google.
 *
 * The mobile tab maps `01712 345678` onto `01712345678@phone.<domain>` — the
 * email identity Supabase Auth already understands — and stores the canonical
 * number in `profiles.phone` so checkout can prefill it. No SMS is sent, which
 * also means the number is not verified; that trade-off is deliberate and is
 * spelled out beneath the field rather than hidden in the docs.
 *
 * `role` is never sent: roles can only be granted from inside the database, so a
 * crafted request cannot award itself one.
 */
export function RegisterForm({
  redirectTo = '/',
  initialMode = 'email',
}: {
  redirectTo?: string;
  initialMode?: IdentifierMode;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<IdentifierMode>(initialMode);
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = React.useState(false);
  /** What went into the account, for the "sign in with these" screen. */
  const [identifierLabel, setIdentifierLabel] = React.useState('');

  const strength = PASSWORD_STRENGTH_META[passwordStrength(password)];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;

    const resolved = resolveSignInIdentifier(mode, mode === 'email' ? email : phone);
    if (!resolved.ok) {
      toast.error('Check your details', { description: resolved.error });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error('Password too short', {
        description: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
      return;
    }

    /*
     * Email sign-up keeps the optional phone field as a delivery contact; a
     * mobile sign-up already owns the number. Either way the value that lands in
     * `profiles.phone` is the canonical `01XXXXXXXXX` when it parses, so the two
     * routes cannot produce two spellings of the same number.
     */
    const phoneForProfile =
      mode === 'email' ? normalizeBdPhone(phone) ?? phone.trim() : resolved.phone ?? '';

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: resolved.email,
        password,
        options: {
          data: { full_name: fullName.trim(), phone: phoneForProfile },
          // Only meaningful for an email account; a mobile alias can never be
          // delivered to, so no confirmation link is ever requested for it.
          emailRedirectTo: mode === 'email' ? authCallbackUrl(redirectTo) : undefined,
        },
      });

      if (error) {
        toast.error('Could not create your account', { description: humanizeError(error) });
        return;
      }

      /*
       * Signing up should hand back a session immediately. If GoTrue still has
       * "Confirm email" switched on it can return the user without one — but the
       * `on_auth_user_auto_confirm` trigger marks the address confirmed at insert
       * time, so a password sign-in right here completes the flow without ever
       * asking the shopper to leave the site.
       */
      let signedIn = Boolean(data.session);

      if (!signedIn) {
        const { error: fallbackError } = await supabase.auth.signInWithPassword({
          email: resolved.email,
          password,
        });

        if (fallbackError) {
          setIdentifierLabel(
            mode === 'phone' ? formatBdPhone(resolved.phone ?? '') : resolved.email,
          );
          setAwaitingConfirmation(true);
          toast.success('Account created', {
            description: 'Sign in with the same details to continue.',
          });
          return;
        }
        signedIn = true;
      }

      toast.success('Account created — you are signed in!', {
        description: `Welcome, ${fullName.trim() || 'shopper'}.`,
      });
      router.push(redirectTo);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
          <MailCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Account created</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We could not sign you in automatically. Use{' '}
            <strong className="text-foreground">{identifierLabel}</strong> and the password you
            just chose to sign in — no email confirmation is required.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}>Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <GoogleSignInButton redirectTo={redirectTo} disabled={loading} />

      <AuthDivider label="or sign up with" />

      <IdentifierTabs value={mode} onChange={setMode} disabled={loading} />

      <div className="grid gap-1.5">
        <Label htmlFor="reg-name">Full name</Label>
        <Input
          id="reg-name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Jane Doe"
          autoComplete="name"
          required
        />
      </div>

      {mode === 'email' ? (
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reg-phone">
              Phone <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="reg-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="01712 345678"
              autoComplete="tel"
            />
            <p className="text-xs text-muted-foreground">
              Speeds up checkout — we prefill it on your next order.
            </p>
          </div>
        </>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="reg-mobile">Mobile number</Label>
          <div className="relative">
            <Smartphone
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="reg-mobile"
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
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              This number becomes your sign-in name, and your delivery contact. We do not send an
              SMS code — so please double-check it.
            </span>
          </p>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="reg-password">Password</Label>
        <Input
          id="reg-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        {password.length > 0 && (
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  'block h-full rounded-full transition-all',
                  strength.bar,
                  strength.width,
                )}
              />
            </span>
            <span className="w-12 text-right text-[11px] font-medium text-muted-foreground">
              {strength.label}
            </span>
          </div>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        <UserPlus className="h-4 w-4" /> Create account
      </Button>

      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        By creating an account you agree to our{' '}
        <Link href="/terms" prefetch className="underline underline-offset-2 hover:text-foreground">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link href="/privacy" prefetch className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link
          href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
