import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OrderCard } from '@/components/storefront/order-card';
import { GuestOrderLookup } from '@/components/storefront/guest-order-lookup';
import { getOrderWithItems } from '@/lib/queries';
import { NO_INDEX } from '@/lib/seo';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = {
  title: 'Order details',
  robots: NO_INDEX,
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { placed?: string; phone?: string };
}) {
  if (!UUID_RE.test(params.id)) notFound();

  // Works for the signed-in owner and for admins. RLS returns nothing otherwise,
  // in which case we fall back to phone-verified guest access.
  const order = await getOrderWithItems(params.id);

  return (
    <div className="container-tight py-10">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/orders">
            <ArrowLeft className="h-4 w-4" /> All orders
          </Link>
        </Button>
      </div>

      {order ? (
        <div className="mx-auto max-w-3xl space-y-6">
          {searchParams.placed === '1' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-semibold text-emerald-900">
                Thank you — your order has been placed!
              </p>
              <p className="mt-0.5 text-sm text-emerald-800">
                Your items are reserved and the stock has been updated in real time.
              </p>
            </div>
          )}
          <OrderCard order={order} showCancel />
        </div>
      ) : (
        <GuestOrderLookup
          orderId={params.id}
          initialPhone={searchParams.phone ?? ''}
          justPlaced={searchParams.placed === '1'}
        />
      )}
    </div>
  );
}
