'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Info, KeyRound, Loader2, UserPlus } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, humanizeError, userRoleMeta } from '@/lib/utils';
import type { AdminUserRow, UserRole } from '@/lib/types';

const STAFF_ROLES: UserRole[] = ['operator', 'admin'];

/** Readable password that satisfies the Supabase default policy (>= 6 chars). */
function suggestPassword() {
  const words = ['nexus', 'savar', 'dhaka', 'parcel', 'ledger', 'studio', 'harbour', 'bazaar'];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}-${digits}-shop`;
}

/**
 * Create an account.
 *
 * This one action cannot be done with SQL: it has to go through the Supabase Auth
 * Admin API, which needs `SUPABASE_SERVICE_ROLE_KEY`. The key is never exposed to
 * the browser — the dialog posts to `/api/admin/users`, which checks the caller is
 * staff and then uses the key server-side.
 *
 * What the caller may create is not theirs to decide: the route resolves the role
 * through `creatableRole()`, so an operator's account is always a **customer**
 * (that is why the picker is hidden for them) and a role out of reach is refused
 * instead of silently downgraded.
 *
 * Without the key the route answers 503 and the dialog says so *before* the form
 * is sent, offering the alternative that always works: have the person register
 * normally (instant, no confirmation) and set their role afterwards.
 */
export function InviteStaffDialog({
  canCreateStaff,
  canChooseRole,
  onCreated,
}: {
  canCreateStaff: boolean;
  /** Administrators pick the role; an operator's creation is always a customer. */
  canChooseRole: boolean;
  onCreated?: (user: AdminUserRow) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState(suggestPassword);
  const [role, setRole] = React.useState<UserRole>('operator');

  const effectiveRole: UserRole = canChooseRole ? role : 'customer';

  function reset() {
    setEmail('');
    setFullName('');
    setPhone('');
    setPassword(suggestPassword());
    setRole('operator');
    setShowPassword(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          password,
          // An operator never sends a role they may not assign — the API would
          // refuse the request outright rather than quietly create a customer.
          role: effectiveRole,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { user?: AdminUserRow; error?: string; detail?: string }
        | null;

      if (!response.ok) {
        toast.error('Could not create the account', {
          description: humanizeError(payload?.error ?? payload?.detail ?? response.statusText),
        });
        return;
      }

      if (payload?.user) onCreated?.(payload.user);
      toast.success(`${email.trim()} can sign in now`, {
        description: `They were created as ${userRoleMeta(effectiveRole).label.toLowerCase()}. Share the password with them.`,
      });
      reset();
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error('Could not create the account', { description: humanizeError(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Add user
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{canChooseRole ? 'Add a staff member' : 'Add a customer account'}</DialogTitle>
            <DialogDescription>
              The account is created already confirmed, so the person can sign in the moment you hand
              over the password.{' '}
              {canChooseRole
                ? 'An operator runs orders, products and stock. An administrator can also manage users and roles.'
                : 'You can add customer accounts; an administrator creates the staff ones.'}
            </DialogDescription>
          </DialogHeader>

          {!canCreateStaff ? (
            <div className="space-y-4">
              <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">Creating accounts needs the service role key</p>
                  <p className="text-amber-900/90 dark:text-amber-200/90">
                    Add <code className="rounded bg-black/5 px-1 dark:bg-white/10">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
                    to <code className="rounded bg-black/5 px-1 dark:bg-white/10">.env.local</code> and
                    restart the server to enable this form. The key stays on the server — it is never
                    sent to the browser.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="space-y-2">
                  <p className="font-medium">Without the key, promote an existing account instead</p>
                  <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                    <li>Ask them to register on the storefront — sign-up is instant, no e-mail link.</li>
                    <li>
                      {canChooseRole ? (
                        <>
                          Open the <strong>Role</strong> picker on their row below and choose{' '}
                          <strong>Operator</strong> (orders, products, stock) or{' '}
                          <strong>Administrator</strong>.
                        </>
                      ) : (
                        <>Ask an administrator to set their role from this table.</>
                      )}
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="staff-email">E-mail</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    required
                    autoComplete="off"
                    placeholder="staff@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="staff-name">Full name</Label>
                  <Input
                    id="staff-name"
                    placeholder="Omar Rahman"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="staff-phone">Phone</Label>
                  <Input
                    id="staff-phone"
                    inputMode="tel"
                    placeholder="01712345678"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="staff-password">Temporary password</Label>
                  <div className="flex gap-2">
                    <Input
                      id="staff-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setShowPassword((value) => !value)}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Suggested and already filled in. Share it once, then let them change it from{' '}
                    <strong>Account</strong>.
                  </p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  {canChooseRole ? (
                    <>
                      <Label htmlFor="staff-role">Role</Label>
                      <Select value={role} onValueChange={(next) => setRole(next as UserRole)}>
                        <SelectTrigger id="staff-role" className="h-10 [&_[data-role-hint]]:hidden">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_ROLES.map((value) => {
                            const meta = userRoleMeta(value);
                            return (
                              <SelectItem key={value} value={value}>
                                <span className="flex items-center gap-2">
                                  <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                                  <span className="font-medium">{meta.label}</span>
                                  <span
                                    data-role-hint
                                    className="hidden text-xs text-muted-foreground sm:inline"
                                  >
                                    {meta.description}
                                  </span>
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        An <strong>operator</strong> runs orders, products and stock. An{' '}
                        <strong>administrator</strong> can also manage users and roles.
                      </p>
                    </>
                  ) : (
                    // No picker at all for an operator: the account they create is
                    // a customer, and saying so is clearer than a locked dropdown.
                    <div className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <p>
                        New accounts are created as{' '}
                        <strong className="text-foreground">Customer</strong>. An administrator can
                        change a role from this table afterwards.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
