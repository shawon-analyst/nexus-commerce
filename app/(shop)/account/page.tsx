import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileDashboard } from '@/components/account/profile-dashboard';
import { getCurrentProfileResult, getMyOrders } from '@/lib/queries';
import { NO_INDEX } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My profile',
  description:
    'Manage your photo, contact details and default delivery address — every field prefills the checkout form.',
  robots: NO_INDEX,
};

export default async function AccountPage() {
  const result = await getCurrentProfileResult();

  if (result.status === 'anonymous') {
    redirect('/login?redirectTo=/account');
  }

  // A failed lookup is deliberately NOT treated as "signed out": bouncing a
  // legitimate shopper to /login because Supabase hiccuped is worse than telling
  // them what actually went wrong.
  if (result.status === 'error') {
    return (
      <div className="container-tight py-16">
        <Card className="mx-auto max-w-xl">
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">We could not load your profile</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">{result.message}</p>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/">Back to the shop</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/login">Sign in again</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const orders = await getMyOrders();

  return (
    <div className="container-tight py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">My profile</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Your photo, contact details and default delivery address live here. Everything you save is
          offered back to you as a prefill at checkout.
        </p>
      </header>

      <ProfileDashboard initialProfile={result.profile} orders={orders} />
    </div>
  );
}
