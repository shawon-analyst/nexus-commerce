'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn, humanizeError } from '@/lib/utils';

type Phase = 'checking' | 'form' | 'expired';

const MIN_LENGTH = 8;

/** Cheap, honest strength signal: length + variety, no third-party meter. */
function strengthOf(password: string): number {
  let score = 0;
  if (password.length >= MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

const STRENGTH_META = [
  { label: '', bar: 'bg-transparent', width: 'w-0' },
  { label: 'Weak', bar: 'bg-destructive', width: 'w-1/4' },
  { label: 'Fair', bar: 'bg-amber-500', width: 'w-2/4' },
  { label: 'Good', bar: 'bg-emerald-500', width: 'w-3/4' },
  { label: 'Strong', bar: 'bg-emerald-500', width: 'w-full' },
];

/**
 * Sets a new password for the account behind a recovery link.
 *
 * Supabase hands the session back one of two ways and both are supported:
 *   - `?code=…` — exchanged by `/auth/callback` into a server cookie, so the
 *     server component already saw a user and renders straight into `form`.
 *   - `#access_token=…&type=recovery` — the implicit flow; the browser client
 *     consumes the fragment on mount, which is why the no-session branch polls
 *     for a moment before declaring the link dead.
 *
 * The password is held only in this component's state for the strength meter,
 * is never logged, and is sent nowhere but `supabase.auth.updateUser`.
 */
export function ResetPasswordForm({
  initialSession,
  email,
}: {
  initialSession: boolean;
  email: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>(initialSession ? 'form' : 'checking');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (initialSession) return;

    let cancelled = false;
    void (async () => {
      const supabase = getSupabaseBrowserClient();
      for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (!cancelled) setPhase('form');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!cancelled) setPhase('expired');
    })();

    return () => {
      cancelled = true;
    };
  }, [initialSession]);

  const score = strengthOf(password);
  const meta = STRENGTH_META[score];
  const matches = password.length > 0 && password === confirm;
  const canSubmit = password.length >= MIN_LENGTH && matches && !loading;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (password.length < MIN_LENGTH) {
      toast.error('Password too short', {
        description: `Use at least ${MIN_LENGTH} characters.`,
      });
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match', { description: 'Retype the same password twice.' });
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error('Could not update your password', { description: humanizeError(error) });
        return;
      }

      toast.success('Password updated', {
        description: 'You are signed in with your new password.',
      });
      router.push('/account');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (phase === 'checking') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Checking your reset link…</p>
      </div>
    );
  }

  if (phase === 'expired') {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">That link has expired</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Reset links last an hour and can only be used once. Request a fresh one and we will
            send it straight over.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Send a new link</Link>
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link href="/login">
            <KeyRound className="h-4 w-4" /> Back to sign in
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {email && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Setting a new password for <strong className="text-foreground">{email}</strong>
        </p>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="new-password">New password</Label>
        <div className="relative">
          <Input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={`At least ${MIN_LENGTH} characters`}
            autoComplete="new-password"
            minLength={MIN_LENGTH}
            className="pr-10"
            required
            autoFocus
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

        {password.length > 0 && (
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn('block h-full rounded-full transition-all', meta.bar, meta.width)}
              />
            </span>
            <span className="w-12 text-right text-[11px] font-medium text-muted-foreground">
              {meta.label}
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type={showPassword ? 'text' : 'password'}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="Retype it"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
        />
        {confirm.length > 0 && !matches && (
          <p className="text-xs text-destructive">Those two do not match yet.</p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!canSubmit}>
        <ShieldCheck className="h-4 w-4" /> Update password
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Your password is hashed and stored by Supabase Auth — it never touches our own servers or
        logs.
      </p>
    </form>
  );
}
