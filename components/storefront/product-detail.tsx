'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronRight,
  Minus,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/ui/safe-image';
import { useLiveProduct } from '@/hooks/use-realtime';
import { useAuth } from '@/components/providers/auth-provider';
import { useCartStore } from '@/store/cart-store';
import { cn, DELIVERY_AREA_META, formatCurrency, signInHref, stockLabel, toNumber } from '@/lib/utils';
import type { ProductWithCategory } from '@/lib/types';

export function ProductDetail({ product: initialProduct }: { product: ProductWithCategory }) {
  const router = useRouter();
  const user = useAuth().user;
  const addLine = useCartStore((s) => s.addLine);

  // live stock counter: updates the moment another shopper checks out
  const { product: live, pulse } = useLiveProduct(initialProduct.id, initialProduct);
  const product = live ?? initialProduct;

  const [quantity, setQuantity] = React.useState(1);
  const [justAdded, setJustAdded] = React.useState(false);
  const [zoom, setZoom] = React.useState({ active: false, x: 50, y: 50 });

  const price = toNumber(product.price);
  const stock = toNumber(product.stock);
  const info = stockLabel(stock, product.low_stock_threshold);
  const soldOut = stock <= 0;
  const maxQty = Math.max(stock, 1);

  // if stock drops below the selected quantity while browsing, clamp it
  React.useEffect(() => {
    setQuantity((q) => Math.min(Math.max(q, 1), maxQty));
  }, [maxQty]);

  function add() {
    if (soldOut) return;
    addLine(
      {
        productId: product.id,
        title: product.title,
        price,
        imageUrl: product.image_url,
        stock,
      },
      quantity,
    );
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1500);
    toast.success(`${quantity} × ${product.title} added to cart`);
  }

  function buyNow() {
    if (soldOut) return;
    addLine(
      {
        productId: product.id,
        title: product.title,
        price,
        imageUrl: product.image_url,
        stock,
      },
      quantity,
    );

    // Checkout is account-only: send signed-out shoppers to sign in first, and
    // straight back to checkout afterwards. The line is already in the cart.
    if (!user) {
      toast.info('Sign in to check out', {
        description: 'Your item is saved in the cart — you will land right back on checkout.',
      });
      router.push(signInHref('/checkout'));
      return;
    }

    router.push('/checkout');
  }

  return (
    <div className="container-tight py-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-foreground">
          Home
        </Link>
        <ChevronRight className="h-3 w-3" />
        <Link href="/products" className="transition-colors hover:text-foreground">
          Products
        </Link>
        {product.categories && (
          <>
            <ChevronRight className="h-3 w-3" />
            <Link
              href={`/products?category=${product.categories.slug}`}
              className="transition-colors hover:text-foreground"
            >
              {product.categories.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3 w-3" />
        <span className="truncate text-foreground">{product.title}</span>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        {/* -------------------------------- viewer -------------------------------- */}
        <div>
          <div
            className="relative aspect-square overflow-hidden rounded-2xl border bg-muted"
            onMouseEnter={() => setZoom((z) => ({ ...z, active: true }))}
            onMouseLeave={() => setZoom({ active: false, x: 50, y: 50 })}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setZoom({
                active: true,
                x: ((event.clientX - rect.left) / rect.width) * 100,
                y: ((event.clientY - rect.top) / rect.height) * 100,
              });
            }}
          >
            <SafeImage
              src={product.image_url}
              alt={product.title}
              priority
              wrapperClassName="h-full w-full"
              sizes="(max-width: 1024px) 100vw, 50vw"
              className={cn(
                'transition-transform duration-200 ease-out',
                zoom.active ? 'scale-[1.6]' : 'scale-100',
              )}
            />
            {zoom.active && (
              <span className="pointer-events-none absolute inset-0" />
            )}

            <div className="absolute left-4 top-4 flex flex-col items-start gap-2">
              {product.featured && <Badge className="shadow-sm">Featured</Badge>}
              {soldOut && <Badge variant="destructive" className="shadow-sm">Sold out</Badge>}
            </div>
          </div>
          {!soldOut && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Hover the image to zoom in
            </p>
          )}
        </div>

        {/* -------------------------------- details ------------------------------- */}
        <div className="flex flex-col">
          {product.categories && (
            <Link
              href={`/products?category=${product.categories.slug}`}
              className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {product.categories.name}
            </Link>
          )}

          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{product.title}</h1>

          <div className="mt-4 flex flex-wrap items-center gap-4">
            <p className="text-3xl font-extrabold tabular-nums">{formatCurrency(price)}</p>

            {/* LIVE stock counter */}
            <div
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                info.tone === 'destructive' && 'border-destructive/20 bg-destructive/5 text-destructive',
                info.tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-700',
                info.tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
              )}
            >
              <span className="relative flex h-2 w-2">
                {pulse && (
                  <span
                    className={cn(
                      'absolute inline-flex h-full w-full animate-pulse-ring rounded-full',
                      info.tone === 'destructive' && 'bg-destructive',
                      info.tone === 'warning' && 'bg-amber-500',
                      info.tone === 'success' && 'bg-emerald-500',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'relative inline-flex h-2 w-2 rounded-full',
                    info.tone === 'destructive' && 'bg-destructive',
                    info.tone === 'warning' && 'bg-amber-500',
                    info.tone === 'success' && 'bg-emerald-500',
                  )}
                />
              </span>
              {info.label}
              <span className="font-normal opacity-70">· live</span>
            </div>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {stock > 0
              ? `In stock and ready to ship · SKU ${product.id.slice(0, 8).toUpperCase()}`
              : 'Currently unavailable — check back soon.'}
          </p>

          <Separator className="my-6" />

          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {product.description || 'No description provided for this product yet.'}
          </p>

          <Separator className="my-6" />

          {/* quantity + actions */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-lg border">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1 || soldOut}
                className="flex h-11 w-11 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                value={quantity}
                min={1}
                max={maxQty}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setQuantity(Number.isFinite(next) ? Math.min(Math.max(next, 1), maxQty) : 1);
                }}
                className="h-11 w-14 border-x bg-transparent text-center text-sm font-semibold tabular-nums focus:outline-none"
                aria-label="Quantity"
              />
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty || soldOut}
                className="flex h-11 w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Subtotal:{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {formatCurrency(price * quantity)}
              </span>
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Button
              size="lg"
              onClick={add}
              disabled={soldOut}
              variant={justAdded ? 'success' : 'default'}
              className="w-full"
            >
              {soldOut ? (
                <>
                  <ShoppingBag className="h-4 w-4" /> Out of stock
                </>
              ) : justAdded ? (
                <>
                  <Check className="h-4 w-4" /> Added to cart
                </>
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4" /> Add to cart
                </>
              )}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={buyNow}
              disabled={soldOut}
              className="w-full"
            >
              <Zap className="h-4 w-4" /> Buy now
            </Button>
          </div>

          <ul className="mt-7 grid gap-3 text-sm sm:grid-cols-2">
            {[
              {
                icon: Truck,
                title: `Delivery from ${formatCurrency(DELIVERY_AREA_META.inside.fee)}`,
                note: 'Inside Dhaka · dispatched within 24h',
              },
              { icon: RefreshCw, title: '30-day returns', note: 'Stock restored on cancel' },
              { icon: ShieldCheck, title: 'Secure checkout', note: 'COD available' },
              { icon: Package, title: 'Tracked delivery', note: 'Live status updates' },
            ].map((item) => (
              <li key={item.title} className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium leading-tight">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.note}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
