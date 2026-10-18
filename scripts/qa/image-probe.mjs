/*
 * Verifies the hardened next/image allow-list on a running server: real image
 * hosts still optimise, an attacker-chosen host is refused.
 *
 *   node scripts/qa/image-probe.mjs                 # expects a server on :3100
 *   PROBE_BASE=http://127.0.0.1:3000 node scripts/qa/image-probe.mjs
 *
 * The closed list is what keeps the `/_next/image` advisories (SSRF, DoS,
 * unbounded cache growth, AVIF RCE) off the table, so this probe guards a
 * security boundary rather than a cosmetic one.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3100';
const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.local');
const env = Object.fromEntries(
  readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const svc = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };

const products = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?select=image_url&image_url=not.is.null&limit=50`, { headers: svc }).then((r) => r.json());
const profiles = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=avatar_url&avatar_url=not.is.null&limit=50`, { headers: svc }).then((r) => r.json());
const unsplash = products.find((p) => p.image_url?.includes('images.unsplash.com'))?.image_url;
const storage = profiles.find((p) => p.avatar_url?.includes('.supabase.co'))?.avatar_url
  ?? products.find((p) => p.image_url?.includes('.supabase.co'))?.image_url;

const results = [];
const check = (name, ok, detail = '') => { results.push({ ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const optimise = async (url, w = 640, q = 75) => {
  const r = await fetch(`${BASE}/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=${q}`);
  return { status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength };
};

for (let i = 0; i < 30; i++) {
  try { if ((await fetch(BASE, { redirect: 'manual' })).status < 500) break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}

if (unsplash) {
  const res = await optimise(unsplash);
  check('allow-listed Unsplash product photo still optimises', res.status === 200 && /image\//.test(res.type ?? ''), `${res.status} ${res.type} ${res.bytes}B`);
} else check('allow-listed Unsplash product photo still optimises', false, 'no unsplash image in the catalogue');

if (storage) {
  const res = await optimise(storage);
  check('Supabase Storage upload still optimises', res.status === 200 && /image\//.test(res.type ?? ''), `${res.status} ${res.type} ${res.bytes}B`);
} else check('Supabase Storage upload still optimises', false, 'no storage image found');

for (const hostile of [
  'https://evil.example.com/payload.avif',
  'https://attacker.test/x.png',
  'https://images.unsplash.com.evil.example.com/a.jpg',
]) {
  const res = await optimise(hostile);
  check(`refused: ${hostile}`, res.status === 400, `${res.status}`);
}

console.log(`\n=== image allow-list probe: ${results.filter((r) => r.ok).length}/${results.length} passed ===`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
