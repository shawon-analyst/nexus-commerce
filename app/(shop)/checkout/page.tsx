import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { CheckoutForm } from '@/components/storefront/checkout-form';
import { CheckoutGate } from '@/components/storefront/checkout-gate';
import { StaffOrderNotice } from '@/components/storefront/staff-order-notice';
import { getCurrentProfileResult } from '@/lib/queries';
import { NO_INDEX } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  description: 'Complete your order with cash on delivery or bKash.',
  robots: NO_INDEX,
};

export default async function CheckoutPage() {
  /*
   * Checkout is account-only. The middleware already redirects anonymous
   * requests, but a stale session cookie reaches this page — so the page decides
   * for itself and never renders the form without a real profile. `error` is
   * kept distinct from `anonymous` so a Supabase hiccup is explained instead of
   * being reported as "you are signed out".
   */
  const result = await getCurrentProfileResult();

  if (result.status !== 'ok') {
    return (
      <div className="container-tight py-6">
        <CheckoutGate reason={result.status === 'error' ? 'error' : 'anonymous'} />
      </div>
    );
  }

  const profile = result.profile;

  /*
   * An operator is a staff member, not a shopper. The rule is enforced in SQL
   * (`place_order()` raises STAFF_CANNOT_ORDER before it touches stock), and this
   * is where it becomes an explanation instead of an error toast after filling in
   * the whole form.
   */
  if (profile.role === 'operator') {
    return (
      <div className="container-tight py-6">
        <StaffOrderNotice />
      </div>
    );
  }

  return (
    <div className="container-tight py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Your stock is reserved the moment you place the order —{' '}
          <Link href="/cart" className="font-medium underline underline-offset-2">
            edit cart
          </Link>
        </p>
      </header>

      <CheckoutForm
        defaultName={profile.full_name ?? ''}
        defaultPhone={profile.phone ?? ''}
        defaultAddress={profile.shipping_address ?? ''}
        isAuthenticated
      />
    </div>
  );
}
