import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/register-form';
import { NO_INDEX } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create a Nexus Commerce account in seconds — or sign up with Google or Facebook.',
  robots: NO_INDEX,
};

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string };
}) {
  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Track orders, save your details and check out in one tap.
        </p>
      </header>
      <RegisterForm redirectTo={searchParams.redirectTo ?? '/'} />
    </>
  );
}
