'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Ban,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Trash2,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { RealtimeDot } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserAvatar } from '@/components/ui/user-avatar';
import { InviteStaffDialog } from '@/components/admin/invite-staff-dialog';
import {
  UserRoleBadge,
  UserRoleSelect,
  UserRowActions,
  UserStatusBadge,
} from '@/components/admin/user-role-control';
import { useRealtimeUsers } from '@/hooks/use-realtime';
import {
  ASSIGNABLE_ROLES,
  cn,
  formatCurrency,
  formatDate,
  humanizeError,
  timeAgo,
  toNumber,
  userRoleMeta,
} from '@/lib/utils';
import type { AdminUserRow, UserRole } from '@/lib/types';

/** Filters read best from the most powerful role down, not the other way round. */
const ROLE_FILTERS: Array<{ value: UserRole | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  ...[...ASSIGNABLE_ROLES].reverse().map((role) => ({ value: role, label: userRoleMeta(role).label })),
];

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'warn' | 'danger';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ring-border',
            tone === 'warn' && 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
            tone === 'danger' && 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
            tone === 'default' && 'bg-muted/60 text-muted-foreground',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}

export function UsersClient({
  initialUsers,
  currentUserId,
  viewerRole,
  canCreateStaff,
  migrationPending,
}: {
  initialUsers: AdminUserRow[];
  currentUserId: string;
  /** The signed-in staff member's role — `admin` gets the controls, `operator` reads. */
  viewerRole: UserRole;
  canCreateStaff: boolean;
  migrationPending: boolean;
}) {
  const router = useRouter();
  const { users, status, lastEventAt, upsert, remove } = useRealtimeUsers(initialUsers);

  /*
   * The whole read/write split, in one boolean. An operator sees the same list and
   * the same "Add user" form (capped at customer accounts) but none of the writing
   * controls — every one of which the database would refuse anyway, since
   * admin_set_user_role/admin_set_user_active/admin_delete_user all require
   * is_admin().
   */
  const isAdmin = viewerRole === 'admin';

  const [term, setTerm] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<UserRole | 'all'>('all');
  const [onlyBlocked, setOnlyBlocked] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const stats = React.useMemo(() => {
    const staff = users.filter((user) => user.role === 'admin' || user.role === 'operator');
    return {
      total: users.length,
      admins: users.filter((user) => user.role === 'admin' && user.is_active).length,
      staff: staff.length,
      blocked: users.filter((user) => !user.is_active).length,
    };
  }, [users]);

  const filtered = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (onlyBlocked && user.is_active) return false;
      if (!needle) return true;
      return (
        (user.full_name ?? '').toLowerCase().includes(needle) ||
        (user.email ?? '').toLowerCase().includes(needle) ||
        (user.phone ?? '').toLowerCase().includes(needle)
      );
    });
  }, [onlyBlocked, roleFilter, term, users]);

  const isSelf = React.useCallback((user: AdminUserRow) => user.id === currentUserId, [currentUserId]);

  /**
   * Why a row's controls are locked — shown as a tooltip on the control.
   *
   * The only account an administrator can lock themselves out of is their own, so
   * that is the whole rule here. The *last active administrator* rule also lives
   * in SQL (`LAST_ADMIN`), which is where it has to be: it must hold for every
   * caller, including the service-role delete that bypasses this component.
   *
   * For an operator every row is locked, and for a different reason: the controls
   * are not rendered at all.
   */
  const lockReason = React.useCallback(
    (user: AdminUserRow) =>
      isSelf(user)
        ? 'You cannot change your own role, block or delete your own account — ask another administrator.'
        : undefined,
    [isSelf],
  );

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: deleteTarget.id }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string }
        | null;

      if (!response.ok) {
        toast.error('Could not delete the account', {
          description: humanizeError(payload?.detail ?? payload?.error ?? response.statusText),
        });
        return;
      }

      remove(deleteTarget.id);
      toast.success(`${deleteTarget.email || deleteTarget.full_name || 'The account'} was deleted`, {
        description: 'Their orders are kept as guest orders, so the sales history is intact.',
      });
      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      toast.error('Could not delete the account', { description: humanizeError(error) });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------------- */}
      {/* Heading                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {isAdmin
              ? 'Everyone with an account: shoppers, operators who run the shop, and administrators. Only an administrator can change a role, block an account or delete one.'
              : 'Everyone with an account: shoppers, staff and administrators. You can add customer accounts; an administrator handles roles, blocking and deletion.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            title="Reload the list"
            onClick={() => router.refresh()}
          >
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Reload</span>
          </Button>
          <InviteStaffDialog
            canCreateStaff={canCreateStaff}
            canChooseRole={isAdmin}
            onCreated={(user) => upsert(user)}
          />
        </div>
      </div>

      {migrationPending && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">The user list came back empty</p>
            <p>
              That normally means the database migration is missing. Run{' '}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">0008_staff_roles.sql</code>,
              then <code className="rounded bg-black/5 px-1 dark:bg-white/10">0009_user_management.sql</code>{' '}
              and then{' '}
              <code className="rounded bg-black/5 px-1 dark:bg-white/10">0010_operator_scope.sql</code>{' '}
              in the Supabase SQL editor, in that order.
            </p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Numbers                                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Accounts" value={stats.total} icon={UsersIcon} hint="every profile on the shop" />
        <StatCard
          label="Staff"
          value={stats.staff}
          icon={UsersIcon}
          hint="administrators + operators"
        />
        <StatCard label="Administrators" value={stats.admins} icon={UsersIcon} hint="active only" />
        <StatCard
          label="Blocked"
          value={stats.blocked}
          icon={Ban}
          tone={stats.blocked > 0 ? 'danger' : 'default'}
          hint="cannot sign in to checkout, account or admin"
        />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Filters                                                          */}
      {/* ---------------------------------------------------------------- */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search by name, e-mail or phone…"
              className="pl-9 pr-9"
              aria-label="Search users"
            />
            {term && (
              <button
                type="button"
                onClick={() => setTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ROLE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setRoleFilter(filter.value)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  roleFilter === filter.value
                    ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {filter.label}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setOnlyBlocked((value) => !value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                onlyBlocked
                  ? 'border-transparent bg-rose-500 text-white shadow-sm'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
              aria-pressed={onlyBlocked}
            >
              <Ban className="h-3.5 w-3.5" />
              Blocked only
            </button>

            <span className="ml-1 hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <RealtimeDot status={status} />
              {lastEventAt && <span>· updated {timeAgo(lastEventAt)}</span>}
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filtered.length}</span> of{' '}
          {users.length} accounts
          {roleFilter !== 'all' && ` · ${userRoleMeta(roleFilter).label}`}
          {onlyBlocked && ' · blocked only'}
        </p>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* The table                                                        */}
      {/* ---------------------------------------------------------------- */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={users.length === 0 ? 'No accounts yet' : 'No accounts match those filters'}
          description={
            users.length === 0
              ? 'Once the migration is applied, every profile — including yours — shows up here.'
              : 'Try a different search term, or clear the role and blocked filters.'
          }
          action={
            users.length > 0 ? (
              <Button
                variant="outline"
                onClick={() => {
                  setTerm('');
                  setRoleFilter('all');
                  setOnlyBlocked(false);
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">E-mail</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden lg:table-cell">Orders</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => {
                const locked = Boolean(lockReason(user));
                const hint = lockReason(user);
                const orders = toNumber(user.order_count);
                const spent = toNumber(user.total_spent);

                return (
                  <TableRow key={user.id} className={cn(!user.is_active && 'bg-rose-50/40 dark:bg-rose-500/5')}>
                    <TableCell className="align-top">
                      <div className="flex items-start gap-3">
                        <UserAvatar
                          src={user.avatar_url}
                          name={user.full_name}
                          email={user.email}
                          className="h-9 w-9 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {user.full_name || <span className="text-muted-foreground">No name</span>}
                            {isSelf(user) && (
                              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                You
                              </span>
                            )}
                          </p>
                          {/* the e-mail column is hidden on phones, so repeat it here */}
                          <p className="truncate text-xs text-muted-foreground md:hidden">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="hidden align-top md:table-cell">
                      <span className="text-sm">{user.email || '—'}</span>
                      {user.phone && <p className="text-xs text-muted-foreground">{user.phone}</p>}
                    </TableCell>

                    <TableCell className="align-top">
                      {isAdmin ? (
                        <UserRoleSelect
                          user={user}
                          disabled={locked}
                          disabledHint={hint}
                          onChanged={(updated) => upsert(updated)}
                        />
                      ) : (
                        // Read-only for an operator: a static badge keeps the
                        // column's shape without offering a write that SQL refuses.
                        <span
                          className="inline-block"
                          title="Only an administrator can change a role."
                        >
                          <UserRoleBadge role={user.role} />
                        </span>
                      )}
                    </TableCell>

                    <TableCell className="hidden align-top lg:table-cell">
                      {orders > 0 ? (
                        <>
                          <p className="font-medium tabular-nums">
                            {orders} {orders === 1 ? 'order' : 'orders'}
                          </p>
                          <p className="text-xs text-muted-foreground">{formatCurrency(spent)}</p>
                          {user.last_order_at && (
                            <p className="text-xs text-muted-foreground">
                              last {timeAgo(user.last_order_at)}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell className="hidden align-top text-sm lg:table-cell">
                      <p>{formatDate(user.created_at)}</p>
                      <p className="text-xs text-muted-foreground">{timeAgo(user.created_at)}</p>
                    </TableCell>

                    <TableCell className="hidden align-top sm:table-cell">
                      <UserStatusBadge isActive={user.is_active} />
                    </TableCell>

                    <TableCell className="align-top">
                      {isAdmin ? (
                        <UserRowActions
                          user={user}
                          disabled={locked}
                          disabledHint={hint}
                          onChanged={(updated) => upsert(updated)}
                          onRequestDelete={(target) => setDeleteTarget(target)}
                        />
                      ) : (
                        <p
                          className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground"
                          title="Only an administrator can block, unblock or delete an account."
                        >
                          <Lock className="h-3.5 w-3.5" /> View only
                        </p>
                      )}
                      {/* phone layout: the status badge is hidden above, so show it here */}
                      <div className="mt-2 sm:hidden">
                        <UserStatusBadge isActive={user.is_active} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Delete confirmation                                              */}
      {/* ---------------------------------------------------------------- */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete {deleteTarget?.full_name || deleteTarget?.email}?
            </DialogTitle>
            <DialogDescription>
              This removes the account and its sign-in for good — they would have to register again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <p className="rounded-lg border bg-muted/40 p-3">
              Their <strong>{toNumber(deleteTarget?.order_count)}</strong>{' '}
              {toNumber(deleteTarget?.order_count) === 1 ? 'order' : 'orders'} are{' '}
              <strong>kept</strong>. Orders outlive the account, so revenue figures never change.
            </p>
            {(deleteTarget?.role === 'admin' || deleteTarget?.role === 'operator') && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                This is a staff account. If they only need a break, <strong>Block</strong> is reversible
                and keeps everything in place.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" loading={deleting} onClick={() => void confirmDelete()}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
