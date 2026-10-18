import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { UsersClient } from '@/components/admin/users-client';
import { getAdminUsers, getCurrentProfileResult } from '@/lib/queries';
import { isStaffRole } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Users' };

/**
 * User management (`/admin/users`) — readable by the whole staff, writable only
 * by administrators.
 *
 * An operator may open this page and add **customer** accounts through the same
 * *Add user* form (useful for onboarding someone over the phone). The role
 * picker, Block and Delete are not rendered for them, and `admin_list_users()` is
 * the only staff-level RPC here — every write still asks the database for
 * `is_admin()` (`admin_set_user_role`, `admin_set_user_active`,
 * `admin_delete_user`), so hiding a control is convenience, never the barrier.
 */
export default async function AdminUsersPage() {
  const result = await getCurrentProfileResult();

  if (result.status === 'anonymous') redirect('/login?redirectTo=/admin/users');

  // A failed lookup is not a permission problem: the admin layout renders the
  // diagnostic, so hand the request back to it rather than pretending the person
  // is signed out.
  if (result.status === 'error') redirect('/admin');

  if (!isStaffRole(result.profile.role)) redirect('/?error=admin-only');

  const users = await getAdminUsers();

  return (
    <UsersClient
      initialUsers={users}
      currentUserId={result.profile.id}
      // Drives the whole read/write split: an operator gets the same list and the
      // same create form, with every account *mutation* out of reach.
      viewerRole={result.profile.role}
      // Creating an account means the Auth Admin API, which needs the service
      // role key. Without it the dialog explains the alternative (they register,
      // an admin promotes them) instead of failing on submit.
      canCreateStaff={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)}
      // Every shop has at least one profile — the person reading this page. An
      // empty list therefore means the RPC is not there yet.
      migrationPending={users.length === 0}
    />
  );
}
