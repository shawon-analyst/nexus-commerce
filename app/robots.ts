import type { MetadataRoute } from 'next';
import { SITE_URL, absoluteUrl } from '@/lib/seo';

/**
 * `/robots.txt`.
 *
 * Only the two areas that must never be crawled are disallowed here. The
 * private-but-harmless pages (`/cart`, `/checkout`, `/account`, `/orders`,
 * `/login`, `/register`) stay crawlable and carry `<meta name="robots"
 * content="noindex">` instead — a disallowed page can still be indexed from
 * links without its content, whereas `noindex` removes it cleanly.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  };
}
