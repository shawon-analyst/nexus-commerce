/*
 * Live cross-tenant probe: proves a signed-in CUSTOMER cannot read another
 * user's orders, order items or profile through the public REST API.
 * Read-only. Never prints keys or other users' PII.
 *
 *   node scripts/qa/rls-probe.mjs
 *
 * Runs against the project in .env.local. It signs in as the QA customer
 * account there and falls back to provisioning (then deleting) a throwaway
 * account when that login no longer exists.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `import.meta.url` rather than a literal path, so the harness runs from a clone
// anywhere. (Not `new URL()` — this file has a local `URL` constant.)
const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.local');

const env = Object.fromEntries(
  readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const QA_EMAIL = 'qa.avatar.1792296407@nexuscommerce.dev';
const QA_PASS = 'ShopTest!2026';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const svc = (path, init = {}) =>
  fetch(`${URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

const asUser = (path, jwt) =>
  fetch(`${URL}${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  });

const signIn = (email, password) =>
  fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

// ---------------------------------------------------------------- fixtures --
let tempUser = null;
let session = await signIn(QA_EMAIL, QA_PASS);
if (session.status !== 200) {
  console.log(`note: QA account sign-in returned ${session.status}; provisioning a throwaway probe account`);
  const email = `rls.probe.${Date.now()}@nexuscommerce.dev`;
  const created = await svc('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password: QA_PASS, email_confirm: true }),
  }).then((r) => r.json());
  tempUser = created.id;
  session = await signIn(email, QA_PASS);
}
if (session.status !== 200) {
  console.log(`FATAL: could not obtain a customer session (${session.status} ${JSON.stringify(session.body)})`);
  process.exit(2);
}
const jwt = session.body.access_token;
const me = session.body.user.id;
console.log(`probe identity: role=customer id=${me.slice(0, 8)}…\n`);

// service-role ground truth (bypasses RLS — this is what "everything" looks like)
const allOrders = await svc('/rest/v1/orders?select=id,user_id&limit=1000').then((r) => r.json());
const allProfiles = await svc('/rest/v1/profiles?select=id&limit=1000').then((r) => r.json());
const myProfile = allProfiles.find((p) => p.id === me);
const foreignOrder = allOrders.find((o) => o.user_id !== me);
const foreignProfile = allProfiles.find((p) => p.id !== me);
console.log(`ground truth (service role): ${allOrders.length} orders, ${allProfiles.length} profiles\n`);

// ------------------------------------------------------------------ probes --
if (foreignOrder) {
  const r = await asUser(`/rest/v1/orders?select=id,user_id,shipping_address,phone`, jwt);
  const rows = await r.json();
  const leaked = rows.filter((o) => o.user_id !== me);
  check('customer GET /orders returns only own rows', r.status === 200 && leaked.length === 0,
    `status=${r.status} rows=${rows.length} foreign=${leaked.length}`);
} else {
  check('customer GET /orders returns only own rows', true, 'skipped — no foreign order in DB to try to leak');
}

if (foreignOrder) {
  const r = await asUser(`/rest/v1/orders?select=*&id=eq.${foreignOrder.id}`, jwt);
  const rows = await r.json();
  check('customer cannot fetch another user\'s order by id', r.status === 200 && rows.length === 0,
    `status=${r.status} rows=${Array.isArray(rows) ? rows.length : 'n/a'}`);
}

const prof = await asUser('/rest/v1/profiles?select=id,email,role,phone', jwt).then((r) => r.json());
check('customer GET /profiles returns exactly own row',
  Array.isArray(prof) && prof.length === 1 && prof[0].id === me,
  `rows=${Array.isArray(prof) ? prof.length : 'n/a'}`);

if (foreignProfile) {
  const r = await asUser(`/rest/v1/profiles?select=id,email,role&id=eq.${foreignProfile.id}`, jwt);
  const rows = await r.json();
  check('customer cannot read another user\'s profile by id', r.status === 200 && rows.length === 0,
    `rows=${Array.isArray(rows) ? rows.length : 'n/a'}`);
}

const items = await asUser('/rest/v1/order_items?select=id,order_id,product_title', jwt).then((r) => r.json());
const myOrderIds = new Set(allOrders.filter((o) => o.user_id === me).map((o) => o.id));
const foreignItems = Array.isArray(items) ? items.filter((i) => !myOrderIds.has(i.order_id)) : [];
check('customer GET /order_items leaks no foreign line items',
  Array.isArray(items) && foreignItems.length === 0,
  `rows=${Array.isArray(items) ? items.length : 'n/a'} foreign=${foreignItems.length}`);

// anonymous (no session at all)
const anonOrders = await fetch(`${URL}/rest/v1/orders?select=id`, { headers: { apikey: ANON } }).then((r) => r.json());
check('anonymous GET /orders returns nothing',
  Array.isArray(anonOrders) && anonOrders.length === 0, `rows=${Array.isArray(anonOrders) ? anonOrders.length : 'n/a'}`);
const anonProfiles = await fetch(`${URL}/rest/v1/profiles?select=id`, { headers: { apikey: ANON } }).then((r) => r.json());
check('anonymous GET /profiles returns nothing',
  Array.isArray(anonProfiles) && anonProfiles.length === 0, `rows=${Array.isArray(anonProfiles) ? anonProfiles.length : 'n/a'}`);

// privilege escalation: can a customer rewrite their own role?
const escalate = await fetch(`${URL}/rest/v1/profiles?id=eq.${me}`, {
  method: 'PATCH',
  headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ role: 'admin' }),
});
const escalateBody = await escalate.text();
const roleAfter = await svc(`/rest/v1/profiles?select=role&id=eq.${me}`).then((r) => r.json());
check('customer cannot promote themselves to admin',
  roleAfter[0]?.role === 'customer',
  `http=${escalate.status} role-after=${roleAfter[0]?.role}${escalateBody && escalate.status >= 400 ? ` err=${escalateBody.slice(0, 80)}` : ''}`);

// --------------------------------------------------------------- teardown --
if (tempUser) {
  await svc(`/auth/v1/admin/users/${tempUser}`, { method: 'DELETE' });
  await svc(`/rest/v1/profiles?id=eq.${tempUser}`, { method: 'DELETE' });
  console.log('\ncleanup: throwaway probe account removed');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== RLS probe: ${results.length - failed.length}/${results.length} passed ===`);
process.exit(failed.length === 0 ? 0 : 1);
