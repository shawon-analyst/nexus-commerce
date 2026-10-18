'use client';

import * as React from 'react';
import Link from 'next/link';
import { Minus, Plus, ShoppingBag, Trash2, Truck, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { SafeImage } from '@/components/ui/safe-image';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/components/providers/auth-provider';
import { cartItemsCount, cartTotals, deliveryAreaMeta, useCartStore } from '@/store/cart-store';
import { cn, formatCurrency, signInHref, toNumber } from '@/lib/utils';

export function CartSheet() {
  const user = useAuth().user;
  const lines = useCartStore((s) => s.lines);
  const isOpen = useCartStore((s) => s.isOpen);
  const closeCart = useCartStore((s) => s.closeCart);
  const hydrated = useCartStore((s) => s.hydrated);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeLine = useCartStore((s) => s.removeLine);
  const deliveryArea = useCartStore((s) => s.deliveryArea);

  const { subtotal, delivery, total } = React.useMemo(
    () => cartTotals(lines, deliveryArea),
    [lines, deliveryArea],
  );
  const count = cartItemsCount(lines);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && closeCart()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l bg-background shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        >
          <div className="flex items-center justify-between border-b px-5 py-4">
            <DialogPrimitive.Title className="flex items-center gap-2 text-base font-semibold">
              <ShoppingBag className="h-4 w-4" />
              Your cart
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {hydrated ? count : 0}
              </span>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Close cart</span>
            </DialogPrimitive.Close>
          </div>

          {lines.length > 0 && (
            <div className="border-b bg-muted/40 px-5 py-3">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Truck className="h-3.5 w-3.5 shrink-0" />
                Delivery{' '}
                <strong className="text-foreground">{formatCurrency(delivery)}</strong> ·{' '}
                {deliveryAreaMeta(deliveryArea).label}. Finalised at checkout.
              </p>
            </div>
          )}

          <div className="thin-scrollbar flex-1 overflow-y-auto px-5 py-4">
            {!hydrated ? (
              <div className="space-y-4">
                {[0, 1].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-20 w-20 animate-pulse rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-3.5 w-1/3 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                  <ShoppingBag className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">Your cart is empty</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Browse the catalogue and add something you love.
                  </p>
                </div>
                <Button asChild onClick={closeCart}>
                  <Link href="/products">Start shopping</Link>
                </Button>
              </div>
            ) : (
              <ul className="space-y-4">
                {lines.map((line) => (
                  <li key={line.productId} className="flex gap-3">
                    <Link
                      href={`/products/${line.productId}`}
                      onClick={closeCart}
                      className="shrink-0"
                    >
                      <SafeImage
                        src={line.imageUrl}
                        alt={line.title}
                        wrapperClassName="h-20 w-20 rounded-lg border"
                        sizes="80px"
                      />
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/products/${line.productId}`}
                          onClick={closeCart}
                          className="line-clamp-2 text-sm font-medium leading-snug hover:underline"
                        >
                          {line.title}
                        </Link>
                        <button
                          type="button"
                          onClick={() => removeLine(line.productId)}
                          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove ${line.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center rounded-md border">
                          <button
                            type="button"
                            onClick={() => decrement(line.productId)}
                            className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-medium tabular-nums">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => increment(line.productId)}
                            disabled={line.quantity >= line.stock}
                            className="flex h-7 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="text-sm font-semibold">
                          {formatCurrency(toNumber(line.price) * line.quantity)}
                        </span>
                      </div>

                      {line.quantity >= line.stock && (
                        <p className="mt-1.5 text-[11px] font-medium text-amber-600">
                          Max available stock reached ({line.stock})
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {hydrated && lines.length > 0 && (
            <div className="border-t bg-background px-5 py-4">
              <dl className="space-y-2 text-sm">
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
                <div className="flex justify-between text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatCurrency(total)}</dd>
                </div>
              </dl>

              <div className="mt-4 grid gap-2">
                <Button asChild size="lg" onClick={closeCart}>
                  <Link href={user ? '/checkout' : signInHref('/checkout')}>
                    {user ? 'Checkout' : 'Sign in to check out'}
                  </Link>
                </Button>
                <Button asChild variant="outline" onClick={closeCart}>
                  <Link href="/cart">View full cart</Link>
                </Button>
              </div>
              {!user && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Your cart is saved — sign in to finish your order.
                </p>
              )}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function CartButton({ className }: { className?: string }) {
  const count = useCartStore((s) => cartItemsCount(s.lines));
  const hydrated = useCartStore((s) => s.hydrated);
  const openCart = useCartStore((s) => s.openCart);

  return (
    <button
      type="button"
      onClick={openCart}
      className={cn(
        'relative inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent',
        className,
      )}
      aria-label={`Open cart${hydrated && count > 0 ? ` (${count} items)` : ''}`}
    >
      <ShoppingBag className="h-5 w-5" />
      {hydrated && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
