import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/register-form';
import type { IdentifierMode } from '@/lib/phone';
import { NO_INDEX } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Create your account',
  description:
    'Create a Nexus Commerce account with Google, your email address or your mobile number in seconds.',
  robots: NO_INDEX,
};

/**
 * `?mode=phone` lets the sign-in screen hand the shopper over with the tab they
 * were already on, so switching from "sign in" to "create one" does not silently
 * move them back to the email form.
 */
export default function RegisterPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string; mode?: string };
}) {
  const initialMode: IdentifierMode = searchParams.mode === 'phone' ? 'phone' : 'email';

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Track orders, save your details and check out in one tap.
        </p>
      </header>
      <RegisterForm redirectTo={searchParams.redirectTo ?? '/'} initialMode={initialMode} />
    </>
  );
}
