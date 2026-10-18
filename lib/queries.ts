import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createPublicClient } from '@/lib/supabase/public';
import { CATEGORIES_TAG, PRODUCTS_TAG } from '@/lib/cache-tags';
import type {
  AdminUserRow,
  Category,
  DashboardStats,
  Order,
  OrderWithItems,
  Product,
  ProductWithCategory,
  Profile,
} from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Cache tags                                                                */
/*  `app/api/revalidate/route.ts` busts these the moment a staff write lands, */
/*  so the storefront is instantly fresh *and* served from memory in-between. */
/* -------------------------------------------------------------------------- */

export { PRODUCTS_TAG, CATEGORIES_TAG };

/* -------------------------------------------------------------------------- */
/*  Auth                                                                      */
/* -------------------------------------------------------------------------- */

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The outcome of resolving "who is making this request".
 *
 * `anonymous` and `error` are deliberately distinct: a Supabase Auth hiccup or
 * a PostgREST failure must never be reported as "you are signed out", because
 * that silently bounces a legitimate admin to /login.
 */
export type ProfileLookup =
  | { status: 'ok'; profile: Profile }
  | { status: 'anonymous' }
  | { status: 'error'; message: string };

/** True when the request carries a Supabase auth cookie (session may be stale). */
function hasAuthCookie() {
  return cookies()
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'));
}

/**
 * The picture an OAuth provider attached to the auth account.
 *   - Google:   `avatar_url` (mirrored to `picture`) as a plain string
 *   - Facebook: `picture` as a nested object — `{ data: { url } }`
 *   - generic:  `image` / `avatar`
 * Anything that is not an http(s) URL is dropped, and non-string JSON shapes are
 * ignored entirely (a naive `picture` read would hand back an object's text).
 * Mirrors `public.oauth_avatar_url()` in the SQL migrations.
 */
function oauthAvatarFor(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;

  const picture = metadata.picture as { data?: { url?: unknown } } | string | undefined;
  const candidates: unknown[] = [
    metadata.avatar_url,
    typeof picture === 'object' && picture !== null ? picture.data?.url : undefined,
    typeof picture === 'string' ? picture : undefined,
    metadata.image,
    metadata.avatar,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }
  return null;
}

async function loadCurrentProfile(): Promise<ProfileLookup> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // A session cookie that failed to validate is an error, not a sign-out.
    return hasAuthCookie()
      ? { status: 'error', message: 'the session could not be validated (expired or rejected token)' }
      : { status: 'anonymous' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) return { status: 'error', message: `profiles lookup failed: ${error.message}` };
  if (data) {
    /*
     * OAuth sign-ups (Google) carry their picture in the auth metadata. Accounts
     * that predate the avatar column, or that were created while the trigger did
     * not copy it, adopt it here on first sight so the header is never a blank
     * circle. A deliberately uploaded picture is never overwritten.
     */
    const metadataAvatar = oauthAvatarFor(user.user_metadata);
    if (!data.avatar_url && metadataAvatar) {
      const { data: updated } = await supabase
        .from('profiles')
        .update({ avatar_url: metadataAvatar })
        .eq('id', user.id)
        .select('*')
        .maybeSingle();
      if (updated) return { status: 'ok', profile: updated };
    }
    return { status: 'ok', profile: data };
  }

  // The auth->profile trigger should have created this; heal if it did not.
  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email ?? '',
      full_name:
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        null,
      avatar_url: oauthAvatarFor(user.user_metadata),
    })
    .select('*')
    .maybeSingle();

  if (insertError) {
    // A concurrent request may have created the row first — re-read before
    // declaring failure (the unique violation is not really an error here).
    const { data: existing } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    return existing
      ? { status: 'ok', profile: existing }
      : { status: 'error', message: `profiles insert failed: ${insertError.message}` };
  }
  if (!created) {
    return {
      status: 'error',
      message:
        'no profile row exists for this account and it could not be created (check the RLS policies on public.profiles)',
    };
  }
  return { status: 'ok', profile: created };
}

/**
 * React `cache()` dedupes this inside a single render pass. The root layout and
 * the admin layout both need the profile, and the page itself may want it too —
 * this makes all of that exactly one auth round trip + one profile read.
 */
export const getCurrentProfileResult = cache(loadCurrentProfile);

/** Best-effort variant used by the root layout — never throws, logs instead. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const result = await getCurrentProfileResult();
  if (result.status === 'error') {
    console.error('[getCurrentProfile]', result.message);
    return null;
  }
  return result.status === 'ok' ? result.profile : null;
}

/* -------------------------------------------------------------------------- */
/*  Catalogue                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Categories are needed by the header, the footer, the homepage grid and the
 * admin filters — all on the same request. Two layers keep that cheap:
 *   - React `cache()`   → one query per request no matter how many callers
 *   - `unstable_cache`  → one query per revalidate window across requests
 * The `categories` tag lets a staff edit bust it instantly.
 */
const loadCategories = unstable_cache(
  async (): Promise<Category[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });
    if (error) return [];
    return (data ?? []) as Category[];
  },
  ['catalogue-categories'],
  { revalidate: 300, tags: [CATEGORIES_TAG] },
);

export const getCategories = cache(loadCategories);

export type ProductQuery = {
  search?: string;
  category?: string; // slug
  sort?: 'newest' | 'price-asc' | 'price-desc' | 'name';
  featuredOnly?: boolean;
  inStockOnly?: boolean;
  limit?: number;
  offset?: number;
};

/** Escapes characters that would corrupt PostgREST's `or=(...)` filter syntax. */
function sanitizeSearch(term: string) {
  return term.replace(/[,()%*\\"']/g, ' ').trim();
}

/**
 * Cached catalogue read (public data only, so no cookies are involved).
 * `unstable_cache` keys on the options object automatically; the `products` tag
 * lets a staff write invalidate it immediately.
 */
const loadProducts = unstable_cache(
  async (options: ProductQuery): Promise<ProductWithCategory[]> => {
    const supabase = createPublicClient();
    const { search, category, sort = 'newest', featuredOnly, inStockOnly, limit, offset } = options;

    let query = supabase
      .from('products')
      .select('*, categories(id, name, slug)')
      .eq('is_active', true);

    const term = search ? sanitizeSearch(search) : '';
    if (term) {
      query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    }

    if (category && category !== 'all') {
      // reuse the cached category list instead of a second round trip
      const categories = await loadCategories();
      const match = categories.find((entry) => entry.slug === category);
      // unknown slug -> guaranteed empty result rather than "everything"
      query = query.eq('category_id', match?.id ?? '00000000-0000-0000-0000-000000000000');
    }

    if (featuredOnly) query = query.eq('featured', true);
    if (inStockOnly) query = query.gt('stock', 0);

    switch (sort) {
      case 'price-asc':
        query = query.order('price', { ascending: true });
        break;
      case 'price-desc':
        query = query.order('price', { ascending: false });
        break;
      case 'name':
        query = query.order('title', { ascending: true });
        break;
      default:
        query = query.order('created_at', { ascending: false });
    }

    if (limit) query = query.range(offset ?? 0, (offset ?? 0) + limit - 1);

    const { data, error } = await query;
    if (error) return [];
    return (data ?? []) as ProductWithCategory[];
  },
  ['catalogue-products'],
  { revalidate: 60, tags: [PRODUCTS_TAG] },
);

export async function getProducts(options: ProductQuery = {}): Promise<ProductWithCategory[]> {
  return loadProducts(options);
}

/**
 * Product detail always reads live (a signed-in admin must be able to preview a
 * hidden product), but React `cache()` still collapses the page + metadata call
 * into one query.
 */
export const getProductById = cache(
  async (id: string): Promise<ProductWithCategory | null> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('products')
      .select('*, categories(id, name, slug)')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return data as ProductWithCategory;
  },
);

export const getRelatedProducts = cache(
  async (
    product: Pick<Product, 'id' | 'category_id'>,
    limit = 4,
  ): Promise<ProductWithCategory[]> => {
    const supabase = createClient();
    let query = supabase
      .from('products')
      .select('*, categories(id, name, slug)')
      .eq('is_active', true)
      .neq('id', product.id)
      .limit(limit);

    if (product.category_id) query = query.eq('category_id', product.category_id);

    const { data, error } = await query;
    if (error) return [];
    return (data ?? []) as ProductWithCategory[];
  },
);

/**
 * Public counters for the hero. Derived from the catalogue only — the previous
 * version counted `orders`, which RLS hides from guests, so it always rendered
 * a misleading zero.
 */
const loadStorefrontStats = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [products, inStock, categories] = await Promise.all([
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gt('stock', 0),
      supabase.from('categories').select('id', { count: 'exact', head: true }),
    ]);

    return {
      products: products.count ?? 0,
      inStock: inStock.count ?? 0,
      categories: categories.count ?? 0,
    };
  },
  ['storefront-stats'],
  { revalidate: 120, tags: [PRODUCTS_TAG, CATEGORIES_TAG] },
);

export async function getStorefrontStats() {
  return loadStorefrontStats();
}

/* -------------------------------------------------------------------------- */
/*  Orders                                                                    */
/* -------------------------------------------------------------------------- */

export async function getOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !data) return null;
  return data as OrderWithItems;
}

export async function getMyOrders(): Promise<OrderWithItems[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as OrderWithItems[];
}

/**
 * Admin order console. The `profiles(...)` embed needs the
 * `orders.user_id -> profiles(id)` foreign key (see §2.7 of 0001_init.sql).
 * If that relationship is missing PostgREST answers PGRST200, which would
 * otherwise show up as an empty console with no explanation — so fall back to a
 * query without the embed and report the real problem to the server log.
 */
export async function getAdminOrders(limit = 200): Promise<OrderWithItems[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), profiles(full_name, email)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!error) return (data ?? []) as OrderWithItems[];

  console.error(
    '[getAdminOrders] could not embed profiles(%s). Run supabase/migrations/0004_fix_orders_profiles_fk.sql.',
    error.message,
  );

  const fallback = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (fallback.error) {
    console.error('[getAdminOrders] fallback query failed:', fallback.error.message);
    return [];
  }
  return (fallback.data ?? []) as unknown as OrderWithItems[];
}

export async function getAdminProducts(): Promise<ProductWithCategory[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(id, name, slug)')
    .order('created_at', { ascending: false });

  if (error) return [];
  return (data ?? []) as ProductWithCategory[];
}

/**
 * Admin users console (`/admin/users`). One RPC round trip: `admin_list_users()`
 * returns every profile plus its order roll-up to any member of staff, and turns
 * a *customer* away with NOT_AUTHORIZED. Reading the directory is ordinary staff
 * work standing next to the orders queue; changing a role, blocking or deleting
 * an account is refused by the RPCs that do those, where a hand-rolled request
 * cannot talk its way past the check.
 *
 * Returns an empty list when the migration is missing, so the page can render
 * its "run 0009/0010" hint instead of throwing.
 */
export async function getAdminUsers(limit = 500): Promise<AdminUserRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('admin_list_users', { p_limit: limit });

  if (error) {
    console.error(
      '[getAdminUsers] admin_list_users failed: %s — run supabase/migrations/0009_user_management.sql, then 0010_operator_scope.sql.',
      error.message,
    );
    return [];
  }
  return data ?? [];
}

export type AdminStatsResult =
  | { ok: true; stats: DashboardStats }
  | { ok: false; kind: 'not_authorized' | 'missing_function' | 'error'; message: string };

/**
 * Distinguishes the three ways this can fail so the dashboard can say something
 * true instead of blaming a missing migration for every problem.
 */
export async function getAdminStats(): Promise<AdminStatsResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('admin_dashboard_stats');

  if (error) {
    const message = error.message || 'unknown error';
    if (message.includes('NOT_AUTHORIZED') || error.code === 'P0001') {
      return { ok: false, kind: 'not_authorized', message };
    }
    if (error.code === 'PGRST202' || message.includes('Could not find the function')) {
      return { ok: false, kind: 'missing_function', message };
    }
    return { ok: false, kind: 'error', message };
  }

  if (!data) {
    return { ok: false, kind: 'missing_function', message: 'admin_dashboard_stats returned no data' };
  }
  return { ok: true, stats: data as unknown as DashboardStats };
}

export async function getRecentOrders(limit = 6): Promise<Array<Pick<Order, 'id' | 'customer_name' | 'total_amount' | 'status' | 'created_at' | 'phone'>>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('orders')
    .select('id, customer_name, total_amount, status, created_at, phone')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}
