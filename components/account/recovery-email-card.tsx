'use client';

import * as React from 'react';
import { AlertTriangle, MailCheck, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useAccountIdentity } from '@/hooks/use-account-identity';
import { displayEmail, isGeneratedEmail } from '@/lib/identity';
import { formatBdPhone } from '@/lib/phone';
import { humanizeError } from '@/lib/utils';
import type { Profile } from '@/lib/types';

/**
 * Link, change or replace the recovery e-mail on the account.
 *
 * "Recovery e-mail" here is the address **Supabase Auth holds for the account**,
 * because that is the only address `resetPasswordForEmail()` can actually reach.
 * For a mobile-number account that address is currently the generated
 * `…@phone.…` alias, which has no mailbox at all — so this card is what stands
 * between "forgot my password" and a support ticket.
 *
 * Writing it needs the service role (see `/api/account/recovery-email`) and is
 * gated on the current password, which is why the form asks for both.
 */
export function RecoveryEmailCard({
  profile,
  onUpdated,
}: {
  profile: Profile;
  onUpdated: (profile: Profile) => void;
}) {
  const identity = useAccountIdentity();
  const [editing, setEditing] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const recoveryEmail = displayEmail(profile.email);
  const isMobileAccount = isGeneratedEmail(profile.email);

  // A Google account already has a real, recoverable address and no password to
  // confirm a change with — the route refuses it, so the card stays off.
  if (identity && !identity.hasPassword) return null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      const response = await fetch('/api/account/recovery-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { email?: string; detail?: string; error?: string }
        | null;

      if (!response.ok) {
        toast.error('Could not save that recovery address', {
          description: humanizeError(payload?.detail ?? payload?.error ?? response.statusText),
        });
        return;
      }

      const saved = payload?.email ?? email.trim().toLowerCase();
      onUpdated({ ...profile, email: saved });
      toast.success('Recovery email saved', {
        description: 'Reset links will go to that inbox from now on.',
      });
      setEditing(false);
      setEmail('');
      setPassword('');
    } catch (error) {
      toast.error('Could not save that recovery address', { description: humanizeError(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="h-4 w-4" /> Recovery email
        </CardTitle>
        <CardDescription>
          {recoveryEmail
            ? 'Password-reset links are sent to this inbox.'
            : 'Where we send a password-reset link when you forget yours.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {recoveryEmail ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
            <span className="min-w-0 break-words text-sm font-medium">{recoveryEmail}</span>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
              Linked
            </Badge>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              No recovery email is linked. Without one, a forgotten password has to be reset by
              support.
            </span>
          </div>
        )}

        {isMobileAccount && (
          <p className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              This account signs in with{' '}
              <strong className="font-medium text-foreground">
                {profile.phone ? formatBdPhone(profile.phone) : 'a mobile number'}
              </strong>
              . The address you add becomes the account&apos;s sign-in address as well — the mobile
              number keeps working, so you can use either.
            </span>
          </p>
        )}

        {recoveryEmail && !editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Change recovery email
          </Button>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="recovery-email">Recovery email address</Label>
              <Input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="recovery-password">Current password</Label>
              <PasswordInput
                id="recovery-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Confirm it is you"
                autoComplete="current-password"
                required
              />
              <p className="text-xs text-muted-foreground">
                Required so a borrowed session alone cannot point your recovery at someone else.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" loading={saving}>
                <ShieldCheck className="h-4 w-4" /> Save recovery email
              </Button>
              {recoveryEmail && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setEmail('');
                    setPassword('');
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
