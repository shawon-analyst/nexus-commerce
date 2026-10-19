'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  KeyRound,
  Loader2,
  Mail,
  MailCheck,
  Send,
  Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authCallbackUrl } from '@/lib/auth-url';
import { formatBdPhone, normalizeBdPhone, phoneFromAliasEmail } from '@/lib/phone';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { SUPPORT_EMAIL, SUPPORT_PHONE, humanizeError } from '@/lib/utils';

/**
 * "Forgot password" — gets a one-time recovery link to the account.
 *
 * A plain e-mail address is handed straight to `resetPasswordForEmail`, which
 * generates a signed, single-use token server-side and points it at
 * `/auth/callback`. The address lives only in component state and is never logged.
 *
 * A **mobile number** cannot go that way. The address that has to be emailed is
 * not the one the shopper typed: it is whichever recovery e-mail they linked, and
 * only the service role can resolve the number to it. So the number is posted to
 * `/api/auth/recover`, which returns one of a handful of outcomes — including the
 * honest "no recovery email is linked" — and never echoes the address back.
 */

/** What `/api/auth/recover` came back with, once a number has been submitted. */
type PhonePhase = 'sending' | 'sent' | 'no-recovery-email' | 'rate-limited' | 'unavailable';

export function ForgotPasswordForm() {
  const [value, setValue] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  /** Set while a mobile number is being handled, and which screen to show. */
  const [phone, setPhone] = React.useState<{ canonical: string; phase: PhonePhase } | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;

    const raw = value.trim();
    if (!raw) return;

    // A number — typed as a number, or as its reserved alias — needs the server.
    const canonical = normalizeBdPhone(raw) ?? phoneFromAliasEmail(raw);
    if (canonical) {
      setLoading(true);
      setPhone({ canonical, phase: 'sending' });
      try {
        const response = await fetch('/api/auth/recover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: canonical }),
        });
        const payload = (await response.json().catch(() => null)) as { status?: string } | null;
        const status = payload?.status;
        setPhone({
          canonical,
          phase:
            status === 'sent' || status === 'rate-limited' || status === 'unavailable'
              ? status
              : 'no-recovery-email',
        });
      } catch {
        // A network failure is indistinguishable from "nothing to email" for the
        // shopper, and both end at the same screen: contact support.
        setPhone({ canonical, phase: 'no-recovery-email' });
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      // Absolute, allow-listed callback URL — see lib/auth-url.ts.
      const redirectTo = authCallbackUrl('/reset-password');

      const { error } = await supabase.auth.resetPasswordForEmail(raw, { redirectTo });

      if (error) {
        // The rate limiter is the only failure worth repeating verbatim.
        if (/rate limit|too many/i.test(error.message)) {
          toast.error('Too many requests', {
            description: 'Please wait a minute before asking for another link.',
          });
        } else {
          toast.error('Could not send the reset link', { description: humanizeError(error) });
        }
        return;
      }

      /*
       * Supabase answers "ok" whether or not the address exists, so this screen
       * must stay deliberately vague — it must never become an account probe.
       */
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  /* ------------------------------------------------- mobile-number account --- */
  if (phone) {
    const number = formatBdPhone(phone.canonical);
    const reset = () => setPhone(null);

    if (phone.phase === 'sending') {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Looking up a recovery address…</p>
        </div>
      );
    }

    if (phone.phase === 'sent') {
      return (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
            <MailCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Check your recovery inbox</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              A secure reset link for{' '}
              <strong className="font-semibold text-foreground">{number}</strong> is on its way to
              the recovery email linked to that account.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            The link works once and expires after an hour. Nothing after a minute? Check your spam
            folder, then try again.
          </p>
          <div className="grid gap-2">
            <Button type="button" variant="outline" onClick={reset}>
              Use a different address
            </Button>
            <Button asChild variant="ghost">
              <Link href="/login">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Link>
            </Button>
          </div>
        </div>
      );
    }

    if (phone.phase === 'rate-limited') {
      return (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Too many requests</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              A reset link has already been asked for recently. Wait a few minutes before trying{' '}
              {number} again.
            </p>
          </div>
          <div className="grid gap-2">
            <Button type="button" variant="outline" onClick={reset}>
              Use a different address
            </Button>
            <Button asChild variant="ghost">
              <Link href="/login">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </Link>
            </Button>
          </div>
        </div>
      );
    }

    if (phone.phase === 'unavailable') {
      return (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Recovery by e-mail is not set up</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              This installation has no service key configured, so a mobile number cannot be looked
              up. Contact support and we will reset it for you.
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </Button>
        </div>
      );
    }

    /* 'no-recovery-email' — the fallback the product asks for, verbatim. */
    return (
      <div className="space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
          <Smartphone className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">No recovery email</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">{number}</strong> is a mobile-number account. There
            is no inbox behind the number itself.
          </p>
        </div>

        <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
          No recovery email is linked to this account. Please contact admin support to reset their
          account password.
        </p>

        <div className="rounded-xl border p-4 text-sm">
          <p className="font-medium">Ask us to reset it</p>
          <p className="mt-1 text-muted-foreground">
            Send us a message from the chat bubbles on this page, or reach us directly — once we
            have checked it is you, we will set a new password with you. If you can still sign in,
            you can also add a recovery email yourself from your profile.
          </p>
          <div className="mt-3 grid gap-2">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Password%20reset%20for%20a%20mobile%20account`}
              className="inline-flex items-center gap-2 font-medium text-foreground underline underline-offset-2"
            >
              <Mail className="h-4 w-4" /> {SUPPORT_EMAIL}
            </a>
            <a
              href={`tel:${SUPPORT_PHONE}`}
              className="inline-flex items-center gap-2 font-medium text-foreground underline underline-offset-2"
            >
              <KeyRound className="h-4 w-4" /> {SUPPORT_PHONE}
            </a>
          </div>
        </div>

        <div className="grid gap-2">
          <Button type="button" variant="outline" onClick={reset}>
            Use a different address
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------- link sent --- */
  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
          <MailCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Check your inbox</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            If <strong className="font-semibold text-foreground">{value.trim()}</strong> has an
            account, a secure reset link is on its way.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          The link works once and expires after an hour. Nothing after a minute? Check your spam
          folder, then try again.
        </p>
        <div className="grid gap-2">
          <Button type="button" variant="outline" onClick={() => setSent(false)}>
            Use a different email
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ form --- */
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-1.5">
        <Label htmlFor="reset-email">Email or mobile number</Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="reset-email"
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="you@example.com or 01712 345678"
            autoComplete="username"
            className="pl-9"
            required
            autoFocus
          />
        </div>
        <p className="text-xs text-muted-foreground">
          We e-mail a one-time verification link that lets you choose a new password. Registered
          with a mobile number? Enter it and we will use the recovery address linked to your
          account.
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        <Send className="h-4 w-4" /> Send reset link
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
