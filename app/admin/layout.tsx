import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/admin-shell';
import { getCurrentProfileResult } from '@/lib/queries';
import { isStaffRole } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin console',
  robots: { index: false, follow: false },
};

/**
 * Second line of defence. `middleware.ts` already blocks customers, but a
 * server-side check here means the admin UI can never render for a shopper even
 * if the matcher config changes.
 *
 * Note the three-way outcome: only a *positive* "no session" or "not staff"
 * redirects. A failed lookup renders a diagnostic instead of bouncing the user
 * to /login — which used to make a backend problem look like a login problem.
 *
 * The console itself is open to `admin` *and* `operator`, `/admin/users`
 * included — an operator may add customer accounts there. What follows from the
 * role (changing a role, blocking, deleting) is refused in SQL and hidden in the
 * page, which is the layer a hand-rolled request cannot bypass.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const result = await getCurrentProfileResult();

  if (result.status === 'anonymous') redirect('/login?redirectTo=/admin');

  if (result.status === 'error') {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold">The admin panel could not load</h1>
        <p className="text-sm text-muted-foreground">
          You are signed in, but the server could not resolve your profile, so access was denied
          rather than risk showing admin data to the wrong account.
        </p>
        <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-xs">
          {result.message}
        </pre>
        <p className="text-sm text-muted-foreground">
          If the message mentions <code>profiles</code>, confirm the migration in{' '}
          <code>supabase/migrations/0001_init.sql</code> has been applied and that RLS allows you to
          read your own row.
        </p>
      </main>
    );
  }

  // A blocked account cannot open the console even with a fresh session cookie.
  if (result.profile.is_active === false) redirect('/login?error=account-disabled');

  if (!isStaffRole(result.profile.role)) redirect('/?error=admin-only');

  return (
    <AdminShell
      role={result.profile.role}
      fullName={result.profile.full_name}
      email={result.profile.email}
    >
      {children}
    </AdminShell>
  );
}
