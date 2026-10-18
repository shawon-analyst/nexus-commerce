import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { JsonLd } from '@/components/seo/json-ld';
import { ProductCard } from '@/components/storefront/product-card';
import { ProductDetail } from '@/components/storefront/product-detail';
import { getProductById, getRelatedProducts } from '@/lib/queries';
import { OG_IMAGE, SITE_NAME, absoluteUrl, openGraphDefaults } from '@/lib/seo';
import { breadcrumbSchema, productSchema } from '@/lib/structured-data';
import { truncate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  if (!UUID_RE.test(params.id)) return { title: 'Product not found' };

  const product = await getProductById(params.id);
  if (!product) return { title: 'Product not found' };

  const description =
    truncate(product.description, 155) ||
    `Buy ${product.title} at ${SITE_NAME} — real-time stock, cash on delivery and nationwide delivery.`;

  // Facebook and WhatsApp key off og:image + og:url, so both are always set.
  // The catalogue card stands in when the product has no photo of its own.
  const images = product.image_url
    ? [{ url: product.image_url, alt: product.title }]
    : [OG_IMAGE];

  return {
    title: product.title,
    description,
    alternates: { canonical: `/products/${product.id}` },
    openGraph: {
      ...openGraphDefaults,
      title: product.title,
      description,
      url: absoluteUrl(`/products/${product.id}`),
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: product.title,
      description,
      images: images.map((image) => image.url),
    },
  };
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) notFound();

  const product = await getProductById(params.id);
  if (!product) notFound();

  const related = await getRelatedProducts(product, 4);

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Products', path: '/products' },
    ...(product.categories
      ? [
          {
            name: product.categories.name,
            path: `/products?category=${product.categories.slug}`,
          },
        ]
      : []),
    { name: product.title, path: `/products/${product.id}` },
  ];

  return (
    <>
      {/* Product + breadcrumb graph: rich results for price, stock and category. */}
      <JsonLd data={[productSchema(product), breadcrumbSchema(crumbs)]} />

      <ProductDetail product={product} />

      {related.length > 0 && (
        <section className="border-t bg-muted/30">
          <div className="container-tight py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">You may also like</h2>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  More from the same collection.
                </p>
              </div>
              {product.categories && (
                <Button asChild variant="ghost">
                  <Link href={`/products?category=${product.categories.slug}`}>
                    All {product.categories.name} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {related.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
