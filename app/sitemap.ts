import type { MetadataRoute } from 'next';
import { createPublicClient } from '@/lib/supabase/public';
import { LEGAL_LINKS } from '@/lib/legal';
import { absoluteUrl } from '@/lib/seo';

/**
 * `/sitemap.xml` — the public catalogue plus the static pages.
 *
 * Rebuilt hourly. It reads through the cookie-free anon client, so RLS hands
 * back exactly the active products a visitor could reach; if Supabase is
 * unreachable the sitemap still ships the static entries rather than a 500.
 *
 * The two policy pages are listed even though they are not marketing content:
 * an OAuth provider reviewing the app fetches the sitemap to confirm the privacy
 * policy is a real, publicly reachable page.
 *
 * Account, cart, checkout and order pages are deliberately absent: they are
 * per-visitor and noindex.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: absoluteUrl('/products'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...LEGAL_LINKS.map((link) => ({
      url: absoluteUrl(link.href),
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];

  try {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from('products')
      .select('id, updated_at')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(5000);

    for (const product of data ?? []) {
      entries.push({
        url: absoluteUrl(`/products/${product.id}`),
        lastModified: product.updated_at ? new Date(product.updated_at) : now,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  } catch {
    // Static entries keep the sitemap valid when the database hiccups.
  }

  return entries;
}
