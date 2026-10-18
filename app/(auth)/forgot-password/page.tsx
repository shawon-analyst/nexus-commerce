import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { NO_INDEX } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Send yourself a secure, single-use link to choose a new password.',
  robots: NO_INDEX,
};

/** Turns the codes the auth callback hands back into something readable. */
function friendlyAuthError(error: string) {
  if (/otp_expired|expired/i.test(error))
    return 'That reset link has expired. Request a fresh one below.';
  if (/access_denied/i.test(error)) return 'That reset link was already used. Request a new one.';
  if (/auth-callback-failed/i.test(error))
    return 'That reset link is no longer valid. Request a fresh one below.';
  return error;
}

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter the email you signed up with and we will send a secure link to choose a new one.
        </p>
      </header>

      {searchParams.error && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{friendlyAuthError(searchParams.error)}</span>
        </div>
      )}

      <ForgotPasswordForm />
    </>
  );
}
