/**
 * The site's public identity in one place: canonical origin, the wording every
 * page falls back to, and the share card Facebook / WhatsApp / X render when a
 * link is opened.
 *
 * `NEXT_PUBLIC_SITE_URL` must be the real `https://` origin in production —
 * every share image, canonical URL and sitemap entry is built from it, so
 * leaving it at `localhost` produces share cards that point at a dev machine.
 */

export const SITE_NAME = 'Nexus Commerce';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(
  /\/+$/,
  '',
);

export const SITE_TAGLINE = 'Premium gear, delivered fast';

export const SITE_DESCRIPTION =
  'Shop audio, wearables, photography and electronics with real-time stock, live order tracking and nationwide delivery across Bangladesh. Cash on delivery or bKash.';

/** 1200x630 fallback card. Re-render with `scripts/make-og-image.ps1`. */
export const OG_IMAGE_PATH = '/og-default.png';

export const OG_IMAGE = {
  url: OG_IMAGE_PATH,
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
};

/** Joins a path onto the canonical origin; the result is safe for `<meta>`. */
export function absoluteUrl(path = '/'): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Metadata from nested segments merges *shallowly*: a page that defines
 * `openGraph` replaces the whole object it inherited, dropping `siteName`,
 * `type` and `locale`. Spread this into every segment that writes its own
 * share card so those three survive.
 */
export const openGraphDefaults = {
  siteName: SITE_NAME,
  type: 'website' as const,
  locale: 'en_US',
};

/**
 * For private or per-visitor pages (cart, checkout, account, orders, auth).
 * Applied as `<meta name="robots">` rather than a robots.txt disallow: a
 * disallowed page can still be indexed from links, while `noindex` drops it.
 */
export const NO_INDEX = { index: false, follow: false } as const;
