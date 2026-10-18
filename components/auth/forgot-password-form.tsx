'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, MailCheck, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError } from '@/lib/utils';

/**
 * "Forgot password" — asks Supabase Auth to e-mail a one-time recovery link.
 *
 * The link is never built by hand: `resetPasswordForEmail` generates a signed,
 * single-use token server-side and points it at `/auth/callback`, which
 * exchanges it for a session and forwards to `/reset-password`. The email
 * address lives only in component state and is handed straight to Supabase — it
 * is never logged.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(
        '/reset-password',
      )}`;

      const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo });

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

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/15">
          <MailCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Check your inbox</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            If <strong className="font-semibold text-foreground">{email.trim()}</strong> has an
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

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-1.5">
        <Label htmlFor="reset-email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="pl-9"
            required
            autoFocus
          />
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        <Send className="h-4 w-4" /> Send reset link
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-2"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
