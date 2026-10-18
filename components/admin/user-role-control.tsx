'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ASSIGNABLE_ROLES, cn, humanizeError, userRoleMeta } from '@/lib/utils';
import type { AdminUserRow, UserRole } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Badges                                                                     */
/* -------------------------------------------------------------------------- */

export function UserRoleBadge({
  role,
  className,
  showDot = true,
}: {
  role: UserRole;
  className?: string;
  showDot?: boolean;
}) {
  const meta = userRoleMeta(role);
  return (
    <Badge variant="outline" className={cn('border font-medium', meta.className, className)}>
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />}
      {meta.label}
    </Badge>
  );
}

export function UserStatusBadge({ isActive, className }: { isActive: boolean; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border font-medium',
        isActive
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300',
        className,
      )}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', isActive ? 'bg-emerald-500' : 'bg-rose-500')}
      />
      {isActive ? 'Active' : 'Blocked'}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/*  Role control                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The role picker. It never writes the column directly — `profiles.role` is not
 * freely writable through PostgREST (the guard trigger refuses it for anyone but
 * an administrator) and every change goes through `admin_set_user_role()`, which
 * is exactly where the "only an administrator may change a role" rule lives.
 *
 * The change is optimistic: the select moves at once and snaps back if the
 * database refuses, so a refused change is never reported as a success.
 */
export function UserRoleSelect({
  user,
  disabled,
  disabledHint,
  onChanged,
}: {
  user: AdminUserRow;
  disabled?: boolean;
  disabledHint?: string;
  onChanged?: (profile: AdminUserRow) => void;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState<UserRole>(user.role);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => setValue(user.role), [user.role]);

  const update = React.useCallback(
    async (next: UserRole) => {
      if (next === value) return;
      const previous = value;
      setValue(next);
      setPending(true);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.rpc('admin_set_user_role', {
          p_user_id: user.id,
          p_role: next,
        });

        if (error) {
          setValue(previous);
          toast.error('Could not change the role', { description: humanizeError(error) });
          return;
        }

        // Some refusals come back as an empty result rather than an error; never
        // report success for a write the database did not confirm.
        if (!data) {
          setValue(previous);
          toast.error('Could not change the role', {
            description: 'The database refused the change — this account is not an administrator.',
          });
          return;
        }

        const updated = data as unknown as AdminUserRow;
        toast.success(`${updated.email || user.email} is now ${userRoleMeta(next).label}`);
        onChanged?.({ ...user, ...updated });
        // the dashboard's customer figure and the nav badges come from RSC
        router.refresh();
      } catch (error) {
        setValue(previous);
        toast.error('Could not change the role', { description: humanizeError(error) });
      } finally {
        setPending(false);
      }
    },
    [onChanged, router, user, value],
  );

  return (
    <Select
      value={value}
      onValueChange={(next) => void update(next as UserRole)}
      disabled={disabled || pending}
    >
      <SelectTrigger
        className="h-9 w-[9.5rem] [&_[data-role-hint]]:hidden"
        aria-label={`Role for ${user.full_name ?? user.email}`}
        title={disabled ? disabledHint : userRoleMeta(value).description}
      >
        {pending ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
          </span>
        ) : (
          <SelectValue />
        )}
      </SelectTrigger>
      <SelectContent>
        {ASSIGNABLE_ROLES.map((role) => {
          const meta = userRoleMeta(role);
          return (
            <SelectItem key={role} value={role}>
              <span className="flex items-center gap-2">
                <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
                <span className="font-medium">{meta.label}</span>
                {/* Radix mirrors the selected item's markup into the trigger, so the
                    one-line explanation is tagged for the trigger to hide. */}
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
  );
}

/* -------------------------------------------------------------------------- */
/*  Block / delete                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Block is the reversible action: the account keeps its history and can still
 * browse, but it cannot sign into checkout/account/admin, and `place_order()`
 * refuses to take an order from it. Unblocking restores it as it was.
 *
 * Deleting is destructive and handled by the caller (it needs a confirmation
 * dialog), so this only asks for it.
 */
export function UserRowActions({
  user,
  disabled,
  disabledHint,
  onChanged,
  onRequestDelete,
}: {
  user: AdminUserRow;
  disabled?: boolean;
  disabledHint?: string;
  onChanged?: (profile: AdminUserRow) => void;
  onRequestDelete?: (user: AdminUserRow) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const toggleActive = React.useCallback(async () => {
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('admin_set_user_active', {
        p_user_id: user.id,
        p_is_active: !user.is_active,
      });

      if (error) {
        toast.error(user.is_active ? 'Could not block the account' : 'Could not unblock the account', {
          description: humanizeError(error),
        });
        return;
      }

      if (!data) {
        toast.error('The database refused the change', {
          description: 'This account is not an administrator.',
        });
        return;
      }

      const updated = data as unknown as AdminUserRow;
      toast.success(
        updated.is_active
          ? `${updated.email || user.email} can sign in again`
          : `${updated.email || user.email} has been blocked`,
        updated.is_active
          ? undefined
          : {
              description:
                'Their order history is kept, but they can no longer sign in to checkout, account or admin.',
            },
      );
      onChanged?.({ ...user, ...updated });
      router.refresh();
    } catch (error) {
      toast.error('Could not update the account', { description: humanizeError(error) });
    } finally {
      setPending(false);
    }
  }, [onChanged, router, user]);

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        className="h-9"
        disabled={disabled || pending}
        title={
          disabled
            ? disabledHint
            : user.is_active
              ? 'Block this account'
              : 'Unblock this account'
        }
        onClick={() => void toggleActive()}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : user.is_active ? (
          <Ban className="h-4 w-4" />
        ) : (
          <Ban className="h-4 w-4 rotate-45" />
        )}
        {user.is_active ? 'Block' : 'Unblock'}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={disabled}
        title={disabled ? disabledHint : 'Delete this account for good'}
        onClick={() => onRequestDelete?.(user)}
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only sm:not-sr-only">Delete</span>
      </Button>
    </div>
  );
}
