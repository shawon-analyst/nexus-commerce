'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/ui/safe-image';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth } from '@/components/providers/auth-provider';
import { StaffOrderNotice } from '@/components/storefront/staff-order-notice';
import {
  cartItemsCount,
  cartTotals,
  deliveryAreaMeta,
  useCartStore,
} from '@/store/cart-store';
import { cn, formatCurrency, signInHref, signUpHref } from '@/lib/utils';

export function CartView() {
  const { user, profile } = useAuth();
  /*
   * An operator is running the shop, not shopping it. Read from the live profile
   * rather than anything cached at sign-in, so the moment an administrator sets
   * the role back to Customer the button returns — the same instant
   * `place_order()` starts accepting orders from this account again.
   */
  const staffCannotOrder = profile?.role === 'operator';
  const lines = useCartStore((s) => s.lines);
  const hydrated = useCartStore((s) => s.hydrated);
  const deliveryArea = useCartStore((s) => s.deliveryArea);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeLine = useCartStore((s) => s.removeLine);
  const clearCart = useCartStore((s) => s.clear);

  const { subtotal, delivery, total } = React.useMemo(
    () => cartTotals(lines, deliveryArea),
    [lines, deliveryArea],
  );
  const count = cartItemsCount(lines);

  if (!hydrated) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4 rounded-xl border p-4">
              <div className="h-24 w-24 animate-pulse rounded-lg bg-muted" />
              <div className="flex-1 space-y-3 py-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/4 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl border bg-muted/40" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        description="Once you add products they will show up here with live pricing and stock."
        action={
          <Button asChild size="lg">
            <Link href="/products">
              Browse products <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-4">
        {lines.map((line) => (
          <Card key={line.productId} className="overflow-hidden">
            <div className="flex flex-col gap-4 p-4 sm:flex-row">
              <Link href={`/products/${line.productId}`} className="shrink-0">
                <SafeImage
                  src={line.imageUrl}
                  alt={line.title}
                  wrapperClassName="h-28 w-full rounded-lg border sm:h-28 sm:w-28"
                  sizes="112px"
                />
              </Link>

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/products/${line.productId}`}
                      className="line-clamp-2 font-semibold leading-snug hover:underline"
                    >
                      {line.title}
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatCurrency(line.price)} each
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(line.productId)}
                    className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remove ${line.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                  <div className="flex items-center rounded-lg border">
                    <button
                      type="button"
                      onClick={() => decrement(line.productId)}
                      className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-10 text-center text-sm font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => increment(line.productId)}
                      disabled={line.quantity >= line.stock}
                      className="flex h-9 w-9 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <p className="text-lg font-bold tabular-nums">
                    {formatCurrency(line.price * line.quantity)}
                  </p>
                </div>

                {line.quantity >= line.stock && (
                  <p className="mt-2 text-xs font-medium text-amber-600">
                    Only {line.stock} available — that is the maximum you can order.
                  </p>
                )}
              </div>
            </div>
          </Card>
        ))}

        <div className="flex items-center justify-between">
          <Button asChild variant="ghost">
            <Link href="/products">
              <ArrowRight className="h-4 w-4 rotate-180" /> Continue shopping
            </Link>
          </Button>
          <Button variant="ghost" onClick={clearCart} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" /> Clear cart
          </Button>
        </div>
      </div>

      <Card className="lg:sticky lg:top-28">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Summary <span className="font-normal text-muted-foreground">({count} items)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            <Truck className="mr-1.5 inline h-3.5 w-3.5" />
            Delivery is{' '}
            <strong className="text-foreground">{formatCurrency(delivery)}</strong> for{' '}
            {deliveryAreaMeta(deliveryArea).label}. You can switch the area at checkout.
          </div>

          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="font-medium tabular-nums">{formatCurrency(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Delivery
                <span className="ml-1 text-[11px] text-muted-foreground/70">
                  ({deliveryAreaMeta(deliveryArea).short})
                </span>
              </dt>
              <dd className="font-medium tabular-nums">{formatCurrency(delivery)}</dd>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCurrency(total)}</dd>
            </div>
          </dl>

          {staffCannotOrder ? (
            <div className="mt-5">
              <StaffOrderNotice variant="inline" />
            </div>
          ) : (
            <Button asChild size="lg" className={cn('mt-5 w-full')}>
              <Link href={user ? '/checkout' : signInHref('/checkout')}>
                {user ? 'Proceed to checkout' : 'Sign in to check out'}{' '}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}

          {!user && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Orders are tied to your account so you can track them —{' '}
              <Link
                href={signUpHref('/checkout')}
                className="font-medium underline underline-offset-2"
              >
                create one in seconds
              </Link>
              . Your cart is saved either way.
            </p>
          )}

          <p className="mt-3 text-center text-xs text-muted-foreground">
            Delivery charge depends on your area — choose Inside or Outside Dhaka at checkout.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
