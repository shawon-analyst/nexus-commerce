import type { Metadata } from 'next';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TrackOrderForm } from '@/components/storefront/track-order-form';
import { MyOrdersList } from '@/components/storefront/my-orders-list';
import { getCurrentProfile, getMyOrders } from '@/lib/queries';
import { NO_INDEX } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My orders',
  description: 'Follow every order from pending to delivered, and cancel while it is pending.',
  robots: NO_INDEX,
};

export default async function OrdersPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="container-tight py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {profile ? 'My orders' : 'Track your order'}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {profile
              ? 'Live status for everything you have ordered. Cancelling a pending order returns the stock instantly.'
              : 'Enter your order reference and the phone number you used at checkout.'}
          </p>
        </div>

        {!profile && (
          <Button asChild variant="outline">
            <Link href="/login?redirectTo=/orders">
              <LogIn className="h-4 w-4" /> Sign in to see all orders
            </Link>
          </Button>
        )}
      </header>

      {profile ? (
        <>
          <MyOrdersList initialOrders={await getMyOrders()} />
          <section className="mt-12">
            <h2 className="mb-4 text-lg font-semibold">Looking for another order?</h2>
            <TrackOrderForm />
          </section>
        </>
      ) : (
        <div className="mx-auto max-w-2xl">
          <TrackOrderForm compact />
        </div>
      )}
    </div>
  );
}
