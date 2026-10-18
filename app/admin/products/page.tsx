import type { Metadata } from 'next';
import { ProductsClient } from '@/components/admin/products-client';
import { getAdminProducts, getCategories } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Products' };

export default async function AdminProductsPage() {
  const [products, categories] = await Promise.all([getAdminProducts(), getCategories()]);

  return <ProductsClient initialProducts={products} categories={categories} />;
}
