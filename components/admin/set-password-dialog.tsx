'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { accountLabel } from '@/lib/identity';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';
import { humanizeError } from '@/lib/utils';
import type { AdminUserRow } from '@/lib/types';

/**
 * An administrator setting someone else's password outright.
 *
 * This is the answer to a mobile-number account: it has no mailbox to send a
 * reset link to, so the only way it can be recovered is for staff to write a new
 * password. The write goes through `/api/admin/users` (PATCH) and the service
 * role's `admin.updateUserById`, so no e-mail, magic link or confirmation is
 * involved — which is also why the success message says, plainly, that the
 * password has to be handed over by hand.
 *
 * Controlled by the parent: there is one dialog for the whole table, driven by
 * whichever row asked for it, rather than one per row.
 */
export function SetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: AdminUserRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const open = Boolean(user);
  const label = user ? accountLabel(user) : '';
  const targetId = user?.id ?? null;

  // Fresh fields every time a different account is opened.
  React.useEffect(() => {
    if (targetId) {
      setPassword('');
      setConfirm('');
    }
  }, [targetId]);

  const matches = password.length > 0 && password === confirm;
  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const canSubmit = longEnough && matches && !saving;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!user) return;

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
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, password }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { detail?: string; error?: string }
        | null;

      if (!response.ok) {
        toast.error('Could not set the password', {
          description: humanizeError(payload?.detail ?? payload?.error ?? response.statusText),
        });
        return;
      }

      toast.success(`Password updated for ${accountLabel(user)}`, {
        description: 'Nothing was emailed — pass it on over a channel you trust.',
      });
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error('Could not set the password', { description: humanizeError(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Set a password
          </DialogTitle>
          <DialogDescription>
            Write a new password for{' '}
            <strong className="font-medium text-foreground">{label}</strong> straight into Supabase
            Auth. No e-mail or reset link is sent, so it works even when the account has no inbox —
            which is exactly the case for a mobile-number account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="admin-new-password">New password</Label>
            <PasswordInput
              id="admin-new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="admin-confirm-password">Confirm new password</Label>
            <PasswordInput
              id="admin-confirm-password"
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

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} disabled={!canSubmit}>
              <ShieldCheck className="h-4 w-4" /> Set password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
