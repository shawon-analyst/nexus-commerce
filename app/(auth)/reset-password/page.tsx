import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { formatBdPhone, phoneFromAliasEmail } from '@/lib/phone';
import { createClient } from '@/lib/supabase/server';
import { NO_INDEX } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your Nexus Commerce account.',
  robots: NO_INDEX,
};

/**
 * Landing point for a recovery link.
 *
 * `/auth/callback` has already exchanged the one-time code for a session cookie
 * by the time this renders, so the server can tell a live link from a dead one
 * before any markup reaches the browser. `cookies()` also makes this route
 * dynamic, which is what we want — it must never be cached.
 *
 * A mobile-number account carries the synthetic `…@phone.<domain>` address, so
 * the raw `user.email` is never shown: it is translated back into the number the
 * shopper actually recognises.
 */
export default async function ResetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const phone = phoneFromAliasEmail(user?.email);
  const identifier = phone ? formatBdPhone(phone) : user?.email ?? null;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Choose a new password</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Pick something long and memorable — you will use it the next time you sign in.
        </p>
      </header>

      <ResetPasswordForm initialSession={Boolean(user)} identifier={identifier} />
    </>
  );
}
