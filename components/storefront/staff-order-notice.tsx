import Link from 'next/link';
import { ArrowRight, ShoppingBag, ShieldAlert, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The notice, verbatim and in one place: the checkout page and the cart both render it. */
export const STAFF_ORDER_BLOCKED_MESSAGE =
  'Staff/Operator accounts cannot place orders. Switch to a customer account to purchase.';

/**
 * What an `operator` sees instead of the checkout form.
 *
 * Staff accounts run the shop; they do not buy with the account that runs it. The
 * rule itself is enforced one layer deeper — `place_order()` raises
 * STAFF_CANNOT_ORDER before it prices a single line, so a hand-rolled REST call
 * gets nowhere — and this is the layer that explains why, on the page they were
 * heading to rather than as a redirect that would leave them guessing.
 *
 * `inline` is the same notice squeezed into the cart summary, where the
 * "Proceed to checkout" button would otherwise be.
 */
export function StaffOrderNotice({ variant = 'page' }: { variant?: 'page' | 'inline' }) {
  if (variant === 'inline') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <p className="flex items-start gap-2 text-sm font-medium">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {STAFF_ORDER_BLOCKED_MESSAGE}
        </p>
        <p className="mt-1.5 pl-6 text-xs text-amber-900/90 dark:text-amber-200/90">
          Your cart is kept — an administrator can switch this account back to a customer, and
          checkout works again straight away.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg">
        <ShieldAlert className="h-7 w-7" />
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Checkout is for customers</h1>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {STAFF_ORDER_BLOCKED_MESSAGE}
      </p>

      <div className="mt-7 grid w-full gap-2.5 sm:grid-cols-2">
        <Button asChild size="lg" className="w-full">
          <Link href="/admin">
            <UserCog className="h-4 w-4" /> Go to the admin console
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href="/products">
            <ShoppingBag className="h-4 w-4" /> Keep browsing
          </Link>
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        An administrator can set this account back to <strong>Customer</strong> from{' '}
        <Link href="/admin/users" className="font-medium underline underline-offset-2">
          Users
        </Link>{' '}
        — after that you can shop with it as usual.
      </p>

      <Button asChild variant="ghost" className="mt-6">
        <Link href="/cart">
          Back to cart <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
