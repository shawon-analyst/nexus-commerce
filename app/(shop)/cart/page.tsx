import type { Metadata } from 'next';
import { CartView } from '@/components/storefront/cart-view';
import { NO_INDEX } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Your cart',
  description: 'Review the items in your cart before checking out.',
  robots: NO_INDEX,
};

export default function CartPage() {
  return (
    <div className="container-tight py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Your cart</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Adjust quantities, then continue to checkout. Stock limits are enforced automatically.
        </p>
      </header>

      <CartView />
    </div>
  );
}
