import type { Metadata } from 'next';
import { CategoriesClient } from '@/components/admin/categories-client';
import { getAdminProducts, getCategories } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Categories' };

export default async function AdminCategoriesPage() {
  const [categories, products] = await Promise.all([getCategories(), getAdminProducts()]);

  const productCounts = products.reduce<Record<string, number>>((acc, product) => {
    if (!product.category_id) return acc;
    acc[product.category_id] = (acc[product.category_id] ?? 0) + 1;
    return acc;
  }, {});

  return <CategoriesClient initialCategories={categories} productCounts={productCounts} />;
}
