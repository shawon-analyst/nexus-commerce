import { CATEGORIES_TAG, PRODUCTS_TAG } from '@/lib/cache-tags';

/**
 * Asks the server to drop the storefront data cache after an admin write.
 *
 * Deliberately fire-and-forget and never throwing: a cache miss is a cosmetic
 * problem, whereas an exception here would make a successful save look failed.
 */
export async function refreshStorefront(tags: string[]): Promise<void> {
  try {
    await fetch('/api/revalidate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
  } catch {
    /* the revalidate window is the fallback */
  }
}

/** Convenience: a product write changes both the product list and its counts. */
export function refreshProductsAndStats() {
  return refreshStorefront([PRODUCTS_TAG, CATEGORIES_TAG]);
}
