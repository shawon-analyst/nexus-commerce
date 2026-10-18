import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Package,
  Sparkles,
  Truck,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductCard } from '@/components/storefront/product-card';
import { SearchBar } from '@/components/storefront/search-bar';
import type { Category, ProductWithCategory } from '@/lib/types';

export function Hero({
  stats,
  categories,
}: {
  stats: { products: number; inStock: number; categories: number };
  categories: Category[];
}) {
  return (
    <section className="relative overflow-hidden border-b bg-gradient-to-br from-primary/[0.04] via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl"
      />

      <div className="container-tight relative grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            Real-time inventory · live order tracking
          </span>

          <h1 className="glow-text mt-5 text-balance text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            Premium gear,
            <span className="block bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              delivered fast.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
            {stats.products} products across {stats.categories} categories. Stock counts update
            live as orders come in — and every cancellation returns the units to the shelf
            automatically.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/products" prefetch>
                Shop the catalogue <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/orders" prefetch>
                Track my order
              </Link>
            </Button>
          </div>

          <div className="mt-8 max-w-md">
            <SearchBar placeholder="Search for headphones, cameras, keyboards…" />
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
            {[
              { label: 'Products', value: stats.products, icon: Package },
              { label: 'In stock now', value: stats.inStock, icon: Truck },
              { label: 'Categories', value: stats.categories, icon: BadgeCheck },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border bg-card/60 p-3 backdrop-blur">
                <stat.icon className="h-4 w-4 text-muted-foreground" />
                <dd className="mt-2 text-2xl font-bold tabular-nums">{stat.value}</dd>
                <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="grid grid-cols-2 gap-4">
            {categories.slice(0, 4).map((category, index) => (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                prefetch
                className={
                  'group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl ' +
                  (index % 2 === 1 ? 'translate-y-6' : '')
                }
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                  {category.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={category.image_url}
                      alt={category.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                      <Zap className="h-7 w-7 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3">
                  <p className="text-sm font-semibold text-white">{category.name}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function FeaturedRail({ products }: { products: ProductWithCategory[] }) {
  if (products.length === 0) return null;

  return (
    <section className="container-tight py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Featured picks</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Hand-selected items our customers love most.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/products">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
        {products.slice(0, 8).map((product, index) => (
          <ProductCard key={product.id} product={product} priority={index < 4} />
        ))}
      </div>
    </section>
  );
}

export function CategoryGrid({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;

  return (
    <section className="border-y bg-muted/30">
      <div className="container-tight py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Shop by category</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Jump straight to the gear you are after.
            </p>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/products?category=${category.slug}`}
              prefetch
              className="group overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="aspect-square w-full overflow-hidden bg-muted">
                {category.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={category.image_url}
                    alt={category.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-muted to-muted-foreground/10">
                    <Package className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="p-3 text-center">
                <p className="text-sm font-semibold group-hover:text-primary">{category.name}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
