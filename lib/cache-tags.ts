/**
 * Cache tags shared by the server (data reads in `lib/queries.ts`, the
 * invalidation route in `app/api/revalidate/route.ts`) and by client components
 * (which fire `refreshStorefront()` after an admin write).
 *
 * Kept in its own module because `lib/queries.ts` imports `next/headers` and
 * therefore cannot be pulled into a client bundle.
 */

export const PRODUCTS_TAG = 'products';
export const CATEGORIES_TAG = 'categories';

/** Every tag a client is allowed to ask the server to drop. */
export const INVALIDATABLE_TAGS = [PRODUCTS_TAG, CATEGORIES_TAG] as const;
