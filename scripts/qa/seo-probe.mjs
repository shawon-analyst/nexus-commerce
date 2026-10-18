/*
 * Verifies the SEO / sharing surface of a running server: share cards, canonical
 * URLs, robots.txt, sitemap.xml, noindex directives and security headers.
 *
 *   # build and serve a production copy first (never clobber the dev server's .next)
 *   $env:NEXT_DIST_DIR='.next-build'; npx next build; npx next start -p 3100
 *   node scripts/qa/seo-probe.mjs
 *
 * PROBE_ORIGIN must match the NEXT_PUBLIC_SITE_URL the build was made with.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.local');

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3100';
const ORIGIN = process.env.PROBE_ORIGIN ?? 'http://localhost:3000';

const decode = (s) =>
  s == null
    ? s
    : s
        .replace(/&amp;/g, '&')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x2F;/g, '/');

const meta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = html.match(
    new RegExp(`<meta[^>]*(?:property|name)="${escaped}"[^>]*>`, 'i'),
  )?.[0];
  return tag ? decode(tag.match(/content="([^"]*)"/i)?.[1] ?? null) : null;
};
const allMeta = (html, key) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...html.matchAll(new RegExp(`<meta[^>]*(?:property|name)="${escaped}"[^>]*>`, 'gi'))];
};
const title = (html) => decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null);
const link = (html, rel) =>
  decode(html.match(new RegExp(`<link[^>]*rel="${rel}"[^>]*>`, 'i'))?.[0]?.match(/href="([^"]*)"/i)?.[1] ?? null);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const get = (path, redirect = 'follow') =>
  fetch(`${BASE}${path}`, { redirect, headers: { 'user-agent': 'facebookexternalhit/1.1' } });

// ------------------------------------------------------------- wait for boot --
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(BASE, { redirect: 'manual' });
    if (r.status < 500) break;
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// --------------------------------------------------------- pick test products --
const env = Object.fromEntries(
  readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const products = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?select=id,title,image_url&is_active=eq.true&limit=200`,
  { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
).then((r) => r.json());
const withImage = products.find((p) => p.image_url);
const noImage = products.find((p) => !p.image_url);
console.log(`fixtures: ${products.length} active products (${withImage ? 'with image ok' : 'no image found'})\n`);

// ------------------------------------------------------------------- home -----
const home = await (await get('/')).text();
check('home <title>', title(home) === 'Nexus Commerce — Premium gear, delivered fast', title(home));
check('home meta description present', (meta(home, 'description') ?? '').length > 60);
check('home og:title', meta(home, 'og:title') === 'Nexus Commerce — Premium gear, delivered fast', meta(home, 'og:title'));
check('home og:type', meta(home, 'og:type') === 'website', meta(home, 'og:type'));
check('home og:site_name', meta(home, 'og:site_name') === 'Nexus Commerce', meta(home, 'og:site_name'));
check('home og:locale', meta(home, 'og:locale') === 'en_US', meta(home, 'og:locale'));
check('home og:url', meta(home, 'og:url') === ORIGIN, meta(home, 'og:url'));
check('home og:url matches canonical', meta(home, 'og:url') === link(home, 'canonical'),
  `og=${meta(home, 'og:url')} canonical=${link(home, 'canonical')}`);
check('home og:image is the absolute card', meta(home, 'og:image') === `${ORIGIN}/og-default.png`, meta(home, 'og:image'));
check('home og:image:width/height', meta(home, 'og:image:width') === '1200' && meta(home, 'og:image:height') === '630',
  `${meta(home, 'og:image:width')}x${meta(home, 'og:image:height')}`);
check('home og:image:alt', Boolean(meta(home, 'og:image:alt')), meta(home, 'og:image:alt'));
check('home twitter:card large image', meta(home, 'twitter:card') === 'summary_large_image', meta(home, 'twitter:card'));
check('home twitter:image absolute', meta(home, 'twitter:image') === `${ORIGIN}/og-default.png`, meta(home, 'twitter:image'));
check('home canonical', link(home, 'canonical') === ORIGIN, link(home, 'canonical'));
check('home is indexable', (meta(home, 'robots') ?? '').includes('index'), meta(home, 'robots'));
check('home googlebot max-image-preview:large', (meta(home, 'googlebot') ?? '').includes('max-image-preview:large'), meta(home, 'googlebot'));
check('home has exactly one og:image', allMeta(home, 'og:image').length === 1, `${allMeta(home, 'og:image').length} tags`);

// ----------------------------------------------------------------- catalogue --
const list = await (await get('/products')).text();
check('products <title> uses template', title(list) === 'Shop all products · Nexus Commerce', title(list));
check('products canonical strips filters', link(list, 'canonical') === `${ORIGIN}/products`, link(list, 'canonical'));
check('products og:image', meta(list, 'og:image') === `${ORIGIN}/og-default.png`, meta(list, 'og:image'));
check('products og:site_name not lost to shallow merge', meta(list, 'og:site_name') === 'Nexus Commerce', meta(list, 'og:site_name'));

// -------------------------------------------------------------- product page --
if (withImage) {
  const html = await (await get(`/products/${withImage.id}`)).text();
  const expected = decode(withImage.title);
  check('product <title> uses template', title(html) === `${expected} · Nexus Commerce`, title(html));
  check('product og:title is the product', meta(html, 'og:title') === expected, meta(html, 'og:title'));
  check('product og:image is the product photo', meta(html, 'og:image') === withImage.image_url, (meta(html, 'og:image') ?? '').slice(0, 70));
  check('product og:image:alt', meta(html, 'og:image:alt') === expected, meta(html, 'og:image:alt'));
  check('product og:url', meta(html, 'og:url') === `${ORIGIN}/products/${withImage.id}`, meta(html, 'og:url'));
  check('product og:site_name survives shallow merge', meta(html, 'og:site_name') === 'Nexus Commerce', meta(html, 'og:site_name'));
  check('product twitter:image present', Boolean(meta(html, 'twitter:image')), (meta(html, 'twitter:image') ?? '').slice(0, 60));
  check('product canonical', link(html, 'canonical') === `${ORIGIN}/products/${withImage.id}`, link(html, 'canonical'));
  check('product has exactly one og:image', allMeta(html, 'og:image').length === 1, `${allMeta(html, 'og:image').length} tags`);
  check('product meta description present', (meta(html, 'description') ?? '').length > 20);

  const guess = await (await get('/products/11111111-2222-4333-8444-555555555555')).text();
  check('unknown product id → "Product not found", no crash',
    title(guess) === 'Product not found · Nexus Commerce', title(guess));
} else {
  check('product page checks', false, 'no active product with an image to test');
}

if (noImage) {
  const html = await (await get(`/products/${noImage.id}`)).text();
  check('product without a photo falls back to the catalogue card',
    meta(html, 'og:image') === `${ORIGIN}/og-default.png`, meta(html, 'og:image'));
} else {
  console.log('SKIP  no active product without an image');
}

// ------------------------------------------------------------------- robots ---
const robotsRes = await get('/robots.txt');
const robots = await robotsRes.text();
check('robots.txt served as text', robotsRes.status === 200 && (robotsRes.headers.get('content-type') ?? '').includes('text'));
check('robots.txt blocks /admin and /api', /Disallow: \/admin/.test(robots) && /Disallow: \/api\//.test(robots));
check('robots.txt allows the catalogue', /Allow: \//.test(robots));
check('robots.txt advertises the sitemap', robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`), robots.match(/Sitemap:.*/)?.[0]);
check('robots.txt does NOT block private pages (noindex handles them)',
  !/Disallow: \/(cart|checkout|account|orders|login|register)/.test(robots));

// ------------------------------------------------------------------ sitemap ---
const sitemapRes = await get('/sitemap.xml');
const sitemap = await sitemapRes.text();
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check('sitemap.xml is valid xml', sitemapRes.status === 200 && sitemap.includes('<urlset'));
check('sitemap has the home page', locs.includes(`${ORIGIN}/`), `${locs.length} urls`);
check('sitemap has /products', locs.includes(`${ORIGIN}/products`));
check('sitemap lists active products with absolute urls',
  locs.filter((u) => u.includes('/products/')).length > 0 && locs.every((u) => u.startsWith(ORIGIN)),
  `${locs.filter((u) => u.includes('/products/')).length} product urls`);
check('sitemap excludes private pages', !locs.some((u) => /\/(cart|checkout|account|orders|login|register|admin)/.test(u)));

// ----------------------------------------------------------------- og image ---
const ogRes = await get('/og-default.png');
const ogBytes = Buffer.from(await ogRes.arrayBuffer());
const isPng = ogBytes[0] === 0x89 && ogBytes.toString('latin1', 1, 4) === 'PNG';
const w = ogBytes.readUInt32BE(16);
const h = ogBytes.readUInt32BE(20);
check('og-default.png served as image/png', ogRes.status === 200 && (ogRes.headers.get('content-type') ?? '').includes('image/png'));
check('og-default.png is a real 1200x630 PNG', isPng && w === 1200 && h === 630, `${w}x${h}, ${(ogBytes.length / 1024).toFixed(0)} KB`);

// ------------------------------------------------------------------ noindex ---
for (const path of ['/cart', '/login', '/register']) {
  const html = await (await get(path)).text();
  check(`${path} is noindex`, (meta(html, 'robots') ?? '').includes('noindex'), meta(html, 'robots'));
}
check('/products is NOT noindex', !(meta(list, 'robots') ?? '').includes('noindex'), meta(list, 'robots') ?? '(none)');

// ------------------------------------------------------------------ headers ---
const head = await get('/');
const H = (k) => head.headers.get(k);
check('header X-Content-Type-Options', H('x-content-type-options') === 'nosniff', H('x-content-type-options'));
check('header X-Frame-Options', H('x-frame-options') === 'SAMEORIGIN', H('x-frame-options'));
check('header Referrer-Policy', H('referrer-policy') === 'strict-origin-when-cross-origin', H('referrer-policy'));
check('header Permissions-Policy', (H('permissions-policy') ?? '').includes('geolocation=()'), H('permissions-policy'));
check('header Strict-Transport-Security', (H('strict-transport-security') ?? '').includes('max-age='), H('strict-transport-security'));

// ----------------------------------------------------------------- redirect ---
const guarded = await fetch(`${BASE}/checkout`, { redirect: 'manual' });
check('anonymous /checkout still redirects to /login',
  guarded.status === 307 && (guarded.headers.get('location') ?? '').includes('/login'),
  `${guarded.status} → ${guarded.headers.get('location')}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n=== SEO probe: ${results.length - failed}/${results.length} passed ===`);
process.exit(failed === 0 ? 0 : 1);
