'use client';

import * as React from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useAccountIdentity } from '@/hooks/use-account-identity';
import { MIN_PASSWORD_LENGTH, PASSWORD_STRENGTH_META, passwordStrength } from '@/lib/password';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn, humanizeError } from '@/lib/utils';

/**
 * Change (or first set) the password for the signed-in account.
 *
 * The current password is **re-checked against GoTrue** before the change is
 * submitted. That is not ceremony: `updateUser({ password })` is satisfied by the
 * session cookie alone, so anyone who finds an unlocked device — or lifts a
 * session — could otherwise choose a new password and lock the owner out. Asking
 * for the password turns a stolen session into a dead end.
 *
 * A Google-only account has no password to confirm, so it gets the same form
 * without the current-password field, framed as *setting* one. That is a genuine
 * upgrade: it lets the account also sign in with an e-mail and a password.
 */
export function ChangePasswordCard() {
  const identity = useAccountIdentity();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // While the identity is still loading, assume a password exists — showing the
  // field that may be removed is safer than hiding one that is required.
  const needsCurrentPassword = identity?.hasPassword !== false;

  const score = passwordStrength(next);
  const meta = PASSWORD_STRENGTH_META[score];
  const longEnough = next.length >= MIN_PASSWORD_LENGTH;
  const matches = next.length > 0 && next === confirm;
  const canSubmit =
    longEnough && matches && !saving && (!needsCurrentPassword || current.length > 0);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!longEnough) {
      toast.error('Password too short', {
        description: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      });
      return;
    }
    if (!matches) {
      toast.error('Passwords do not match', { description: 'Retype the same password twice.' });
      return;
    }

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();

      if (needsCurrentPassword) {
        if (!identity?.email) {
          toast.error('Could not verify your account', {
            description: 'Refresh the page and try again.',
          });
          return;
        }

        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: identity.email,
          password: current,
        });

        if (reauthError) {
          toast.error('That is not your current password', {
            description: 'Nothing was changed — check it and try again.',
          });
          return;
        }
      }

      const { error } = await supabase.auth.updateUser({ password: next });

      if (error) {
        toast.error('Could not change your password', { description: humanizeError(error) });
        return;
      }

      toast.success(needsCurrentPassword ? 'Password changed' : 'Password set', {
        description: 'Use it the next time you sign in.',
      });
      setCurrent('');
      setNext('');
      setConfirm('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" /> Password
        </CardTitle>
        <CardDescription>
          {needsCurrentPassword
            ? 'Confirm your current password, then choose a new one.'
            : 'This account signs in with Google. Setting a password here also lets you sign in with your e-mail address.'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {identity === null ? (
          <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your sign-in method…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {needsCurrentPassword && (
              <div className="grid gap-1.5">
                <Label htmlFor="current-password">Current password</Label>
                <PasswordInput
                  id="current-password"
                  value={current}
                  onChange={(event) => setCurrent(event.target.value)}
                  placeholder="Your password today"
                  autoComplete="current-password"
                  required
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="account-new-password">New password</Label>
              <PasswordInput
                id="account-new-password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              {next.length > 0 && (
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
              <Label htmlFor="account-confirm-password">Confirm new password</Label>
              <PasswordInput
                id="account-confirm-password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder="Retype it"
                autoComplete="new-password"
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              {confirm.length > 0 && !matches && (
                <p className="text-xs text-destructive">Those two do not match yet.</p>
              )}
            </div>

            <Button type="submit" className="w-full sm:w-auto" loading={saving} disabled={!canSubmit}>
              <ShieldCheck className="h-4 w-4" />
              {needsCurrentPassword ? 'Change password' : 'Set password'}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
