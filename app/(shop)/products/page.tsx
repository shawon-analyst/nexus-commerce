import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { CatalogFilters } from '@/components/storefront/catalog-filters';
import { ProductCard } from '@/components/storefront/product-card';
import { getCategories, getProducts, type ProductQuery } from '@/lib/queries';
import { OG_IMAGE, OG_IMAGE_PATH, absoluteUrl, openGraphDefaults } from '@/lib/seo';

export const dynamic = 'force-dynamic';

const LIST_TITLE = 'Shop all products';
const LIST_DESCRIPTION =
  'Browse the full Nexus Commerce catalogue with live stock, category filters and instant search.';

export const metadata: Metadata = {
  title: LIST_TITLE,
  description: LIST_DESCRIPTION,
  // Filters live in the query string, so every variant points back here.
  alternates: { canonical: '/products' },
  openGraph: {
    ...openGraphDefaults,
    title: LIST_TITLE,
    description: LIST_DESCRIPTION,
    url: absoluteUrl('/products'),
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: LIST_TITLE,
    description: LIST_DESCRIPTION,
    images: [absoluteUrl(OG_IMAGE_PATH)],
  },
};

type SearchParams = {
  q?: string;
  category?: string;
  sort?: string;
  inStock?: string;
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const search = searchParams.q?.trim() ?? '';
  const category = searchParams.category ?? 'all';
  const sort = (searchParams.sort as ProductQuery['sort']) ?? 'newest';
  const inStockOnly = searchParams.inStock === '1';

  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ search, category, sort, inStockOnly }),
  ]);

  const activeCategory = categories.find((c) => c.slug === category);

  return (
    <div className="container-tight py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          {search
            ? `Results for “${search}”`
            : activeCategory
              ? activeCategory.name
              : 'All products'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {products.length} {products.length === 1 ? 'product' : 'products'} available with live
          stock counts.
        </p>
      </header>

      <CatalogFilters categories={categories} resultCount={products.length} />

      {products.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={PackageSearch}
          title="No products matched"
          description={
            search
              ? `We could not find anything for “${search}”. Try a different keyword or clear the filters.`
              : 'This category is empty for now. Check back soon.'
          }
          action={
            <Button asChild>
              <Link href="/products">Reset filters</Link>
            </Button>
          }
        />
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
