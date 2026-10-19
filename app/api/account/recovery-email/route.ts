import { NextResponse } from 'next/server';
import { createAdminClient, createAnonClient, createClient } from '@/lib/supabase/server';
import { isGeneratedEmail } from '@/lib/identity';
import { humanizeError } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Link, change or replace the recovery e-mail on the signed-in account.
 *
 * This is the one operation the browser cannot do on its own. Supabase's
 * client-side `updateUser({ email })` requires confirming the change from **both**
 * the old and the new address (the project has *secure email change* on), and a
 * mobile-number account's old address is the generated alias — a mailbox that
 * does not exist. So the change would sit half-finished forever.
 *
 * The service-role Admin API writes the new address directly
 * (`email_confirm: true`), which is the same operation GoTrue performs once both
 * confirmations land. Because that skips the e-mail round trip, ownership of the
 * account is instead proved with the **current password**, which the caller has
 * to type. An attacker holding only a stolen session cookie cannot use this to
 * point recovery at their own mailbox.
 *
 * Consequence to be honest about, in the UI and in the README: the new address
 * becomes the account's sign-in address. The mobile tab keeps working because
 * `/api/auth/phone-signin` resolves the number to whatever address Auth holds.
 */
function fail(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, ...(detail ? { detail } : {}) }, { status });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return fail(401, 'AUTH_REQUIRED', 'Sign in again and retry.');

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fail(
      503,
      'SERVICE_ROLE_REQUIRED',
      'Set SUPABASE_SERVICE_ROLE_KEY to change a recovery address, or ask an administrator to set your password directly.',
    );
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, 'INVALID_JSON');
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!EMAIL_RE.test(email)) {
    return fail(400, 'INVALID_EMAIL', 'Enter a valid e-mail address.');
  }
  if (isGeneratedEmail(email)) {
    return fail(
      400,
      'INVALID_EMAIL',
      'Use a mailbox you can open — not a shop-internal address.',
    );
  }

  const provider = (user.app_metadata as { provider?: string } | undefined)?.provider;
  if (provider && provider !== 'email') {
    return fail(
      409,
      'OAUTH_ACCOUNT',
      'This account signs in with Google, so it has no password to confirm a change with.',
    );
  }

  const currentEmail = (user.email ?? '').trim();
  if (!currentEmail) {
    return fail(409, 'NO_EMAIL_IDENTITY', 'This account has no password sign-in to confirm with.');
  }
  if (email === currentEmail) {
    return fail(400, 'SAME_EMAIL', 'That is already your recovery address.');
  }

  // Re-authenticate with the current password before touching the auth record.
  const { error: reauthError } = await createAnonClient().auth.signInWithPassword({
    email: currentEmail,
    password,
  });

  if (reauthError) {
    return fail(403, 'INVALID_PASSWORD', 'That is not your current password.');
  }

  try {
    const admin = createAdminClient();

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
    });

    if (error) {
      const taken = /already|registered|exists/i.test(error.message);
      return fail(
        taken ? 409 : 500,
        taken ? 'EMAIL_TAKEN' : 'UPDATE_FAILED',
        taken ? 'That address already belongs to another account.' : humanizeError(error.message),
      );
    }

    // Keep the mirror in step at once so the admin users table is right before the
    // next page render. `loadCurrentProfile()` would heal it anyway.
    await admin.from('profiles').update({ email }).eq('id', user.id);

    return NextResponse.json({ ok: true, email });
  } catch (error) {
    return fail(500, 'UPDATE_FAILED', humanizeError(error));
  }
}
