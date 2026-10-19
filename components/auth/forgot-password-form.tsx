'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, KeyRound, Mail, MailCheck, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authCallbackUrl } from '@/lib/auth-url';
import { formatBdPhone, isPhoneAliasEmail, normalizeBdPhone } from '@/lib/phone';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { SUPPORT_EMAIL, SUPPORT_PHONE, humanizeError } from '@/lib/utils';

/**
 * "Forgot password" — asks Supabase Auth to email a one-time recovery link.
 *
 * The link is never built by hand: `resetPasswordForEmail` generates a signed,
 * single-use token server-side and points it at `/auth/callback`, which exchanges
 * it for a session and forwards to `/reset-password`. The address lives only in
 * component state and is handed straight to Supabase — it is never logged.
 *
 * A **mobile-number** account is the one case email cannot serve: its address is
 * the synthetic `…@phone.<domain>` alias, which has no mailbox and would bounce.
 * Rather than fire a request that quietly fails, the form recognises a number and
 * says who to ask instead. The check is on the *shape* of the input, not on
 * whether an account exists, so it cannot be used to probe for accounts.
 */
export function ForgotPasswordForm() {
  const [value, setValue] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  /** Set when the input is a mobile number rather than an email address. */
  const [phoneAccount, setPhoneAccount] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const raw = value.trim();
    if (!raw) return;

    const phone = normalizeBdPhone(raw);
    if (phone || isPhoneAliasEmail(raw)) {
      setPhoneAccount(phone ?? raw);
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
  if (phoneAccount) {
    return (
      <div className="space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
          <Smartphone className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">A mobile number has no inbox</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            <strong className="text-foreground">{formatBdPhone(phoneAccount)}</strong> signs in with
            its own password, and there is no email address behind it for us to send a reset link
            to.
          </p>
        </div>

        <div className="rounded-xl border p-4 text-sm">
          <p className="font-medium">Ask us to reset it</p>
          <p className="mt-1 text-muted-foreground">
            Send us a message from the chat bubbles on this page, or reach us directly — we will
            verify it is you and set a new password with you.
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
          <Button type="button" variant="outline" onClick={() => setPhoneAccount(null)}>
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
            placeholder="you@example.com"
            autoComplete="username"
            className="pl-9"
            required
            autoFocus
          />
        </div>
        <p className="text-xs text-muted-foreground">
          We email a one-time verification link that lets you choose a new password.
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
