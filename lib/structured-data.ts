/**
 * schema.org JSON-LD builders.
 *
 * Kept as plain objects (rather than JSX) so they can be unit-checked and reused
 * by any surface. Every builder returns a single node; pass several to `<JsonLd>`
 * and it emits one graph, which is what Google prefers over a stack of separate
 * `<script>` tags.
 *
 * `absoluteUrl` is used everywhere because structured data must carry full URLs —
 * relative paths are ignored by crawlers.
 */
import {
  OG_IMAGE_PATH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  absoluteUrl,
} from '@/lib/seo';
import { SUPPORT_EMAIL, SUPPORT_PHONE, toNumber } from '@/lib/utils';import type { ProductWithCategory } from '@/lib/types';

export type JsonLdNode = Record<string, unknown>;

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/** E.164, which is what schema.org expects for `telephone`. */
function e164(bd: string): string {
  return '+880' + bd.replace(/^0/, '').replace(/\D/g, '');
}

export function organizationSchema(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    slogan: SITE_TAGLINE,
    image: absoluteUrl(OG_IMAGE_PATH),
    email: SUPPORT_EMAIL,
    address: {
      // Mirrors SHOP_ADDRESS ('Hemayetpur, Savar, Dhaka') from lib/utils, split
      // into the parts schema.org expects.
      '@type': 'PostalAddress',
      streetAddress: 'Hemayetpur',
      addressLocality: 'Savar',
      addressRegion: 'Dhaka',
      addressCountry: 'BD',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: e164(SUPPORT_PHONE),
        contactType: 'customer support',
        areaServed: 'BD',
        availableLanguage: ['en', 'bn'],
      },
    ],
  };
}

export function websiteSchema(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
    publisher: { '@id': ORGANIZATION_ID },
    // Powers the search box Google can show under the site name.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: absoluteUrl('/products?q={search_term_string}'),
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function productSchema(product: ProductWithCategory): JsonLdNode {
  const price = toNumber(product.price);
  const stock = toNumber(product.stock);
  const url = absoluteUrl(`/products/${product.id}`);

  return {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.title,
    description: product.description ?? `${product.title} — available at ${SITE_NAME}.`,
    image: product.image_url ? [product.image_url] : [absoluteUrl(OG_IMAGE_PATH)],
    sku: product.id.slice(0, 8).toUpperCase(),
    ...(product.categories ? { category: product.categories.name } : {}),
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'BDT',
      price: price.toFixed(2),
      itemCondition: 'https://schema.org/NewCondition',
      availability:
        stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@id': ORGANIZATION_ID },
    },
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
