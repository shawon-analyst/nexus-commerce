import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, PackageSearch, RefreshCw, ShieldAlert, ShieldCheck, Truck, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { CategoryGrid, FeaturedRail, Hero } from '@/components/storefront/hero';
import { ProductCard } from '@/components/storefront/product-card';
import { getCategories, getProducts, getStorefrontStats } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The home page keeps the root layout's share card (title, description and the
 * catalogue image) and only claims its canonical URL.
 */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

/**
 * The middleware sends a non-staff account that reached `/admin` here, and a
 * blocked account to `/login`. A silent landing would leave the person guessing,
 * so the home page explains whichever of the two happened.
 */
function homeNotice(code?: string) {
  switch (code) {
    case 'admin-only':
      return 'That area is for staff. You are signed in as a customer, so the console stayed closed — administrators and operators can open it.';
    case 'account-disabled':
      return 'This account has been blocked. Ask an administrator to unblock it.';
    default:
      return null;
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { error?: string | string[] };
}) {
  const [categories, featured, latest, stats] = await Promise.all([
    getCategories(),
    getProducts({ featuredOnly: true, limit: 8 }),
    getProducts({ sort: 'newest', limit: 8 }),
    getStorefrontStats(),
  ]);

  const rawError = searchParams?.error;
  const notice = homeNotice(Array.isArray(rawError) ? rawError[0] : rawError);

  const featuredIds = new Set(featured.map((p) => p.id));
  const newArrivals = latest.filter((p) => !featuredIds.has(p.id)).slice(0, 8);
  const showcase = newArrivals.length > 0 ? newArrivals : latest;

  return (
    <>
      {notice && (
        <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="container-tight flex items-center gap-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <p className="flex-1">{notice}</p>
            <Link href="/" className="shrink-0 text-xs font-medium underline underline-offset-2">
              Dismiss
            </Link>
          </div>
        </div>
      )}

      <Hero stats={stats} categories={categories} />

      <FeaturedRail products={featured} />

      <CategoryGrid categories={categories} />

      <section className="container-tight py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">New arrivals</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Fresh stock, updated the moment it lands in the warehouse.
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/products?sort=newest">
              See everything <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {showcase.length === 0 ? (
          <EmptyState
            className="mt-7"
            icon={PackageSearch}
            title="No products yet"
            description="Sign in as an administrator and add your first product from the admin panel."
            action={
              <Button asChild>
                <Link href="/admin/products">Open admin panel</Link>
              </Button>
            }
          />
        ) : (
          <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {showcase.map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 4} />
            ))}
          </div>
        )}
      </section>

      <section className="border-t bg-muted/30">
        <div className="container-tight grid gap-6 py-12 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Zap,
              title: 'Real-time inventory',
              body: 'Stock counts move live. Nothing oversells, ever.',
            },
            {
              icon: RefreshCw,
              title: 'Automatic stock restore',
              body: 'Cancel an order and the units return to the shelf instantly.',
            },
            {
              icon: Truck,
              title: 'Fast, tracked delivery',
              body: 'Follow every parcel from pending to delivered.',
            },
            {
              icon: ShieldCheck,
              title: 'Secure accounts',
              body: 'Row Level Security protects every row in the database.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border bg-card p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 text-sm font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
