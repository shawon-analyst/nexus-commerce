import { createAdminClient } from '@/lib/supabase/server';
import { normalizeBdPhone } from '@/lib/phone';

/**
 * Find the account a Bangladeshi mobile number belongs to.
 *
 * Server-only, and always service-role: the lookup is the one place that has to
 * bridge a *number* to the *e-mail address Supabase Auth actually stores*, and it
 * must never expose that address to the browser (see `/api/auth/phone-signin`).
 *
 * Two wrinkles it exists to absorb:
 *
 *  1. `profiles.phone` was free text before mobile sign-in shipped, so the same
 *     number can be stored as `01934100750`, `+8801934100750` or `880…`. The
 *     canonical form is tried first (everything the app writes today); the
 *     fallback matches the ten local digits, which catches the legacy spellings
 *     without scanning the table.
 *  2. `profiles.email` is a *mirror* of the auth record and can lag behind it —
 *     `auth.users` is the authority, so the address is read back from there.
 */
export async function lookupAccountByPhone(
  canonical: string,
): Promise<{ id: string; email: string; phone: string | null } | null> {
  const admin = createAdminClient();

  const { data: exact } = await admin
    .from('profiles')
    .select('id, email, phone')
    .eq('phone', canonical)
    .limit(1);

  let row = (exact ?? []).find((candidate) => normalizeBdPhone(candidate.phone ?? '') === canonical);

  if (!row) {
    const { data: loose } = await admin
      .from('profiles')
      .select('id, email, phone')
      .like('phone', `%${canonical.slice(1)}%`)
      .limit(5);

    row = (loose ?? []).find((candidate) => normalizeBdPhone(candidate.phone ?? '') === canonical);
  }

  if (!row) return null;

  const { data: authUser } = await admin.auth.admin.getUserById(row.id);
  const email = (authUser?.user?.email ?? row.email ?? '').trim();

  return { id: row.id, email, phone: row.phone };
}
