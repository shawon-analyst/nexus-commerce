'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, Plus, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { SafeImage } from '@/components/ui/safe-image';
import { useCartStore } from '@/store/cart-store';
import { cn, formatCurrency, stockLabel, toNumber } from '@/lib/utils';
import type { ProductWithCategory } from '@/lib/types';

export function ProductCard({
  product,
  priority = false,
  className,
}: {
  product: ProductWithCategory;
  priority?: boolean;
  className?: string;
}) {
  const addLine = useCartStore((s) => s.addLine);
  const [added, setAdded] = React.useState(false);

  const price = toNumber(product.price);
  const stock = toNumber(product.stock);
  const stockInfo = stockLabel(stock, product.low_stock_threshold);
  const soldOut = stock <= 0;

  function handleAdd(event: React.MouseEvent) {
    event.preventDefault();
    if (soldOut) return;

    addLine({
      productId: product.id,
      title: product.title,
      price,
      imageUrl: product.image_url,
      stock,
    });

    setAdded(true);
    window.setTimeout(() => setAdded(false), 1400);
    toast.success('Added to cart', {
      description: product.title,
      action: { label: 'View cart', onClick: () => useCartStore.getState().openCart() },
    });
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-lg',
        className,
      )}
    >
      <Link
        href={`/products/${product.id}`}
        prefetch
        className="relative block aspect-square overflow-hidden"
      >
        <SafeImage
          src={product.image_url}
          alt={product.title}
          priority={priority}
          wrapperClassName="h-full w-full"
          className="transition-transform duration-500 group-hover:scale-105"
        />

        <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {product.featured && !soldOut && (
            <Badge variant="default" className="shadow-sm">
              Featured
            </Badge>
          )}
          {soldOut && (
            <Badge variant="destructive" className="shadow-sm">
              Sold out
            </Badge>
          )}
          {!soldOut && stock <= product.low_stock_threshold && (
            <Badge variant="warning" className="shadow-sm">
              Only {stock} left
            </Badge>
          )}
        </div>

        {product.categories && (
          <span className="absolute bottom-3 left-3 rounded-full bg-background/90 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
            {product.categories.name}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link href={`/products/${product.id}`} prefetch className="group/title">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug transition-colors group-hover/title:text-primary">
            {product.title}
          </h3>
        </Link>

        <p className="mt-1.5 line-clamp-2 flex-1 text-xs text-muted-foreground">
          {product.description}
        </p>

        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(price)}</p>
            <p
              className={cn(
                'text-[11px] font-medium',
                stockInfo.tone === 'destructive' && 'text-destructive',
                stockInfo.tone === 'warning' && 'text-amber-600',
                stockInfo.tone === 'success' && 'text-emerald-600',
              )}
            >
              {stockInfo.label}
            </p>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            disabled={soldOut}
            aria-label={soldOut ? `${product.title} is sold out` : `Add ${product.title} to cart`}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-all',
              soldOut
                ? 'cursor-not-allowed bg-muted text-muted-foreground'
                : added
                  ? 'bg-emerald-600 text-white'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95',
            )}
          >
            {soldOut ? (
              <>
                <ShoppingBag className="h-3.5 w-3.5" /> Sold out
              </>
            ) : added ? (
              <>
                <Check className="h-3.5 w-3.5" /> Added
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Add
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
