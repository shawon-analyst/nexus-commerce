import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { creatableRole, humanizeError } from '@/lib/utils';
import type { AdminUserRow, UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * User management actions that PostgREST cannot do on its own.
 *
 * Creating an account means the Supabase **Auth Admin API** (service-role key);
 * deleting one is attempted in SQL first, so the database keeps ownership of the
 * rules (no self-deletion, never the last administrator) and this route only
 * steps in when the SQL path cannot remove the `auth.users` row itself.
 *
 * Two levels of access, mirroring the SQL exactly:
 *
 *   staff (`is_staff()`) — create an account. An operator passes this check and
 *     `creatableRole()` caps what they may create at `customer`; asking for
 *     anything else is refused rather than quietly downgraded.
 *   admin (`is_admin()`) — delete an account.
 *
 * The service-role key never leaves the server: the caller is authenticated with
 * their own cookies and re-checked against the database before anything happens.
 */
async function authorize(level: 'staff' | 'admin') {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, status: 401, error: 'AUTH_REQUIRED' };
  }

  // The permission comes from the database, never the client payload — and since
  // 0009 both helpers also return false for a blocked account, so this route
  // follows the same rule as the RLS policies. The role itself is read from the
  // caller's own profile row (RLS allows exactly that) purely to decide what they
  // may create; it is never trusted for anything SQL also checks.
  const [check, profile] = await Promise.all([
    supabase.rpc(level === 'admin' ? 'is_admin' : 'is_staff'),
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ]);

  // `is_staff()` arrives with 0008/0009. Until they are applied that call fails
  // with "function does not exist", so fall back to `is_admin()` (present since
  // the first migration) and let the access decision stay a truthful 403 for a
  // customer instead of a 500. The fallback can only ever be *stricter* — an
  // operator account cannot exist before the migration that defines the role.
  const ready =
    check.error && level === 'staff'
      ? await supabase.rpc('is_admin')
      : check;

  if (ready.error) {
    return {
      ok: false as const,
      status: 500,
      error: 'SCHEMA_NOT_READY',
      detail: `${level === 'admin' ? 'is_admin' : 'is_staff'}() failed: ${
        ready.error.message
      } — apply supabase/migrations/0008_staff_roles.sql and 0009_user_management.sql.`,
    };
  }

  if (!ready.data) {
    return { ok: false as const, status: 403, error: 'NOT_AUTHORIZED' };
  }

  return {
    ok: true as const,
    supabase,
    userId: user.id,
    role: (profile.data?.role ?? 'customer') as UserRole,
  };
}

function fail(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, ...(detail ? { detail } : {}) }, { status });
}

/* -------------------------------------------------------------------------- */
/*  POST — create an account                                                  */
/* -------------------------------------------------------------------------- */

export async function POST(request: Request) {
  const guard = await authorize('staff');
  if (!guard.ok) return fail(guard.status, guard.error, 'detail' in guard ? guard.detail : undefined);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // The dialog already says this before submitting; the route repeats it so a
    // hand-rolled call gets the same honest answer.
    return fail(
      503,
      'SERVICE_ROLE_REQUIRED',
      'Set SUPABASE_SERVICE_ROLE_KEY to create accounts, or let the person register and then change their role from the users table.',
    );
  }

  let body: {
    email?: unknown;
    password?: unknown;
    full_name?: unknown;
    phone?: unknown;
    role?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return fail(400, 'INVALID_JSON');
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(400, 'INVALID_EMAIL', 'Enter a valid e-mail address.');
  }
  if (password.length < 6) {
    return fail(400, 'WEAK_PASSWORD', 'The password must be at least 6 characters.');
  }

  // What this caller may hand out: an operator creates customers, only an
  // administrator creates staff. A role that is out of reach is refused outright
  // — silently downgrading it would be a lie about what just happened.
  const role = creatableRole(guard.role, typeof body.role === 'string' ? body.role : null);
  if (!role) {
    return fail(
      403,
      'ROLE_NOT_ALLOWED',
      guard.role === 'admin'
        ? 'Pick a role for the new account: an operator or an administrator.'
        : 'Operators can add customer accounts. Ask an administrator to create a staff account.',
    );
  }

  try {
    const admin = createAdminClient();

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      // instant access: the shop never sends confirmation e-mails
      email_confirm: true,
      user_metadata: { full_name: fullName || null, phone: phone || null },
    });

    if (error || !data.user) {
      const message = error?.message ?? 'the auth service returned no user';
      const taken = /already|registered|exists/i.test(message);
      return fail(taken ? 409 : 500, taken ? 'EMAIL_TAKEN' : 'CREATE_FAILED', humanizeError(message));
    }

    // The sign-up trigger has already built the profile (as `customer`). Move it
    // to the role that was asked for. This runs as the service role, i.e. with no
    // `auth.uid()`, which is the one path `fn_guard_profile_role` lets through —
    // the same escape hatch the SQL editor uses.
    const { data: profile, error: roleError } = await admin
      .from('profiles')
      .update({ role })
      .eq('id', data.user.id)
      .select('*')
      .maybeSingle();

    if (roleError) {
      // Do not leave a half-made staff account behind silently.
      await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
      return fail(500, 'ROLE_ASSIGN_FAILED', humanizeError(roleError));
    }

    const user: AdminUserRow = profile
      ? { ...(profile as AdminUserRow), order_count: 0, total_spent: 0, last_order_at: null }
      : {
          id: data.user.id,
          email,
          full_name: fullName || null,
          phone: phone || null,
          avatar_url: null,
          shipping_address: null,
          role,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          order_count: 0,
          total_spent: 0,
          last_order_at: null,
        };

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return fail(500, 'CREATE_FAILED', humanizeError(error));
  }
}

/* -------------------------------------------------------------------------- */
/*  DELETE — remove an account for good                                       */
/* -------------------------------------------------------------------------- */

export async function DELETE(request: Request) {
  // Administrators only: an operator may add customers, never remove anyone.
  const guard = await authorize('admin');
  if (!guard.ok) return fail(guard.status, guard.error, 'detail' in guard ? guard.detail : undefined);

  let body: { user_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, 'INVALID_JSON');
  }

  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return fail(400, 'INVALID_USER_ID');
  }

  if (userId === guard.userId) {
    // also refused in SQL; catching it here keeps the message the same everywhere
    return fail(409, 'CANNOT_DELETE_SELF', 'Ask another administrator to remove your account.');
  }

  /*
   * SQL first. `admin_delete_user()` is where the rules live (no self-deletion,
   * never the last active administrator) and it removes the `auth.users` row,
   * which cascades to the profile and detaches the customer's orders
   * (`user_id = null`) so the revenue history survives.
   *
   * It can only fail for a *privilege* reason: in some Supabase projects the
   * postgres role may not delete from `auth.users`. When that happens the whole
   * RPC call rolls back — nothing was deleted — and the service-role Admin API
   * finishes the job, which is the same operation performed by GoTrue itself.
   */
  const { error } = await guard.supabase.rpc('admin_delete_user', { p_user_id: userId });

  if (!error) {
    return NextResponse.json({ ok: true, deleted: userId });
  }

  const message = error.message ?? '';
  const refused = /NOT_AUTHORIZED|CANNOT_DELETE_SELF|LAST_ADMIN|USER_NOT_FOUND|AUTH_REQUIRED/.test(
    message,
  );

  if (refused) {
    const status = /USER_NOT_FOUND/.test(message) ? 404 : 409;
    return fail(status, message.split(':')[0].trim(), humanizeError(message));
  }

  if (!/AUTH_DELETE_FORBIDDEN|permission denied/i.test(message)) {
    return fail(500, 'DELETE_FAILED', humanizeError(message));
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail(503, 'SERVICE_ROLE_REQUIRED', humanizeError(message));
  }

  try {
    const admin = createAdminClient();
    const { error: apiError } = await admin.auth.admin.deleteUser(userId);

    if (apiError) {
      return fail(500, 'DELETE_FAILED', humanizeError(apiError.message));
    }

    // The Auth Admin API deletes `auth.users`; the profile follows by cascade.
    // Confirm it really is gone rather than assuming.
    const { data: leftover } = await admin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (leftover) {
      const { error: cleanupError } = await admin.from('profiles').delete().eq('id', userId);
      if (cleanupError) {
        return fail(500, 'DELETE_FAILED', humanizeError(cleanupError.message));
      }
    }

    return NextResponse.json({ ok: true, deleted: userId });
  } catch (error) {
    return fail(500, 'DELETE_FAILED', humanizeError(error));
  }
}
