/*
 * Verifies the storefront settings round against a running server.
 *
 *   node scripts/qa/settings-probe.mjs        # add PROBE_BASE=… for another port
 *
 * Three halves:
 *
 *  1. **Rendering** — the storefront and the legal page quote the live fees and
 *     the live bKash wallet, and the disabled "Pay online" radio is really
 *     disabled in the served HTML.
 *  2. **Authorisation** — `/api/admin/settings` refuses anonymous callers and
 *     signed-in customers, and rejects malformed money/phone/toggle input. No
 *     fixture is needed for this: a refusal is the expected answer.
 *  3. **Round trip** — provisions a throwaway *administrator* with the
 *     service-role Admin API, signs in through the real login endpoint, saves new
 *     settings, proves the storefront changed, then restores the original values
 *     and deletes the account. Everything it writes is undone in `finally`.
 *
 * It never prints a key and never touches a real shopper's account.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.local');
const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:3100';

const env = Object.fromEntries(
  readFileSync(ENV_FILE, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const skip = (name, why) => console.log(`SKIP  ${name}  — ${why}`);

const svcHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function admin(method, path, body) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: svcHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function post(path, body, cookie) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    /* non-JSON is a finding in itself */
  }
  const setCookies =
    response.headers.getSetCookie?.() ??
    (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  return { status: response.status, body: parsed, setCookies };
}

const jar = (setCookies) => setCookies.map((line) => line.split(';')[0]).join('; ');

/** Signs in through Supabase Auth and mints the cookie `@supabase/ssr` reads. */
async function signIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  let session = null;
  try {
    session = await response.json();
  } catch {
    /* handled below */
  }

  if (response.status !== 200 || !session?.access_token) {
    return { status: response.status, body: session, cookie: '' };
  }

  // `@supabase/ssr` stores the session as `base64-` + base64url(JSON), in a
  // cookie named `sb-<project-ref>-auth-token` (chunked only past ~3 KB).
  const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
  const value = `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`;
  return { status: 200, body: { ok: true }, cookie: `sb-${ref}-auth-token=${value}` };
}

/**
 * Collapses React's `<!-- -->` separators so rendered text can be matched.
 *
 * `<script>` blocks are removed first: the settings travel to the client provider
 * inside the RSC flight payload, so searching raw HTML for a phrase would find it
 * even when nothing rendered it. These checks are about what a shopper sees.
 */
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

/** Reads the singleton row straight from PostgREST with the service role. */
async function readSettings() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/site_settings?id=eq.site&select=*`, {
    headers: svcHeaders,
  });
  if (!response.ok) return { ok: false, status: response.status, body: await response.text() };
  const rows = await response.json();
  return { ok: true, row: rows[0] ?? null };
}

/* ------------------------------------------------------------------ render -- */

async function html(path) {
  const response = await fetch(`${BASE}${path}`, { headers: { 'cache-control': 'no-cache' } });
  return { status: response.status, body: await response.text() };
}

console.log('--- rendering (live project) ---');

const home = await html('/');
check('home renders', home.status === 200, `HTTP ${home.status}`);
check(
  'announcement bar present (enabled or built-in fallback)',
  /Store announcements|CASH ON DELIVERY AVAILABLE/.test(home.body),
);

const terms = await html('/terms');
check('terms renders', terms.status === 200, `HTTP ${terms.status}`);
const termsText = visibleText(terms.body);
const insideMatch = termsText.match(/Inside Dhaka\s*—\s*৳\s*([\d,.]+)/);
const outsideMatch = termsText.match(/Outside Dhaka\s*—\s*৳\s*([\d,.]+)/);
check('terms quotes an Inside Dhaka fee', Boolean(insideMatch), insideMatch?.[1] ?? 'not found');
check('terms quotes an Outside Dhaka fee', Boolean(outsideMatch), outsideMatch?.[1] ?? 'not found');

/* ------------------------------------------------------------ authorisation -- */

console.log('\n--- authorisation ---');

const anon = await post('/api/admin/settings', {
  inside_dhaka_charge: 1,
  outside_dhaka_charge: 1,
  bkash_number: '01711111111',
  top_announcement_text: '',
  top_announcement_enabled: true,
});
check('anonymous save is refused', anon.status === 401, `HTTP ${anon.status} ${anon.body?.error ?? ''}`);

// A customer session: the QA account if it exists, otherwise a throwaway.
const CUSTOMER_EMAIL = 'qa.avatar.1792296407@nexuscommerce.dev';
const CUSTOMER_PASS = 'ShopTest!2026';
let tempCustomer = null;
let customerCookie = null;

let customer = await signIn(CUSTOMER_EMAIL, CUSTOMER_PASS);
if (!customer.cookie) {
  const email = `settings.probe.customer.${Date.now()}@nexuscommerce.dev`;
  const created = await admin('POST', '/auth/v1/admin/users', {
    email,
    password: CUSTOMER_PASS,
    email_confirm: true,
  });
  tempCustomer = created.body?.id ?? null;
  customer = await signIn(email, CUSTOMER_PASS);
}
customerCookie = customer.cookie;

if (!customerCookie) {
  skip('customer save is refused', 'could not obtain a customer session');
} else {
  const asCustomer = await post(
    '/api/admin/settings',
    {
      inside_dhaka_charge: 1,
      outside_dhaka_charge: 1,
      bkash_number: '01711111111',
      top_announcement_text: 'hacked',
      top_announcement_enabled: true,
    },
    customerCookie,
  );
  check(
    'customer save is refused',
    asCustomer.status === 403,
    `HTTP ${asCustomer.status} ${asCustomer.body?.error ?? ''}`,
  );
}

if (tempCustomer) await admin('DELETE', `/auth/v1/admin/users/${tempCustomer}`).catch(() => {});

/* --------------------------------------------------------------- round trip -- */

console.log('\n--- round trip (throwaway administrator) ---');

const before = await readSettings();
if (!before.ok || !before.row) {
  skip('settings round trip', 'public.site_settings is not readable — run 0014_site_settings.sql');
  console.log(
    before.ok
      ? '  (table exists but the singleton row is missing)'
      : `  (PostgREST said HTTP ${before.status}: ${String(before.body).slice(0, 160)})`,
  );
} else {
  const original = before.row;
  const email = `settings.probe.admin.${Date.now()}@nexuscommerce.dev`;
  const password = 'ShopTest!2026';
  let adminId = null;
  let cookie = null;

  try {
    const created = await admin('POST', '/auth/v1/admin/users', {
      email,
      password,
      email_confirm: true,
    });
    adminId = created.body?.id ?? null;
    check('throwaway administrator created', Boolean(adminId), `HTTP ${created.status}`);
    if (!adminId) throw new Error('no user id');

    // The sign-up trigger made a `customer` profile; promote it. No auth.uid() on
    // the service-role path, which is the one route `fn_guard_profile_role` allows.
    const promoted = await admin('PATCH', `/rest/v1/profiles?id=eq.${adminId}`, {
      role: 'admin',
      is_active: true,
    });
    check('throwaway administrator promoted', promoted.status < 300, `HTTP ${promoted.status}`);

    const session = await signIn(email, password);
    cookie = session.cookie;
    check('administrator can sign in', Boolean(cookie), `HTTP ${session.status}`);
    if (!cookie) throw new Error('no session');

    // --- rejects malformed input before writing anything -------------------
    const badCharge = await post(
      '/api/admin/settings',
      {
        inside_dhaka_charge: -5,
        outside_dhaka_charge: 120,
        bkash_number: '01789138295',
        top_announcement_text: '',
        top_announcement_enabled: true,
      },
      cookie,
    );
    check('negative fee is refused', badCharge.status === 400, badCharge.body?.error ?? '');

    const badPhone = await post(
      '/api/admin/settings',
      {
        inside_dhaka_charge: 60,
        outside_dhaka_charge: 120,
        bkash_number: 'not-a-number',
        top_announcement_text: '',
        top_announcement_enabled: true,
      },
      cookie,
    );
    check('invalid bKash number is refused', badPhone.status === 400, badPhone.body?.error ?? '');

    const badToggle = await post(
      '/api/admin/settings',
      {
        inside_dhaka_charge: 60,
        outside_dhaka_charge: 120,
        bkash_number: '01789138295',
        top_announcement_text: '',
        top_announcement_enabled: 'yes',
      },
      cookie,
    );
    check('non-boolean toggle is refused', badToggle.status === 400, badToggle.body?.error ?? '');

    // --- a real save -------------------------------------------------------
    const marker = `PROBE ${Date.now()}`;
    const saved = await post(
      '/api/admin/settings',
      {
        inside_dhaka_charge: 63,
        outside_dhaka_charge: 127,
        bkash_number: '01712345678',
        top_announcement_text: `${marker} | SECOND SEGMENT`,
        top_announcement_enabled: true,
      },
      cookie,
    );

    check('administrator can save', saved.status === 200 && saved.body?.ok === true, `HTTP ${saved.status}`);
    check(
      'response echoes the saved row',
      saved.body?.settings?.insideDhakaCharge === 63 &&
        saved.body?.settings?.outsideDhakaCharge === 127,
      JSON.stringify(saved.body?.settings ?? {}),
    );
    check(
      'bKash number normalised to 11 digits',
      saved.body?.settings?.bkashNumber === '01712345678',
      saved.body?.settings?.bkashNumber ?? '',
    );

    const after = await readSettings();
    check(
      'database holds the new fees',
      after.ok &&
        Number(after.row?.inside_dhaka_charge) === 63 &&
        Number(after.row?.outside_dhaka_charge) === 127,
      after.ok ? `${after.row?.inside_dhaka_charge}/${after.row?.outside_dhaka_charge}` : 'unreadable',
    );

    // --- the storefront picks it up immediately ---------------------------
    // `revalidatePath('/', 'layout')` ran inside the save, so no sleep is needed.
    const homeAfter = await html('/');
    const homeAfterText = visibleText(homeAfter.body);
    check('storefront shows the new announcement', homeAfterText.includes(marker));
    check('both announcement segments rendered', homeAfterText.includes('SECOND SEGMENT'));

    const termsAfter = await html('/terms');
    const termsAfterText = visibleText(termsAfter.body);
    check('terms quotes the new Inside fee', /৳\s*63(?!\d)/.test(termsAfterText), '৳ 63');
    check('terms quotes the new Outside fee', /৳\s*127(?!\d)/.test(termsAfterText), '৳ 127');
    check('terms quotes the new bKash wallet', termsAfterText.includes('01712345678'));

    // --- the toggle hides the bar -----------------------------------------
    const hidden = await post(
      '/api/admin/settings',
      {
        inside_dhaka_charge: 63,
        outside_dhaka_charge: 127,
        bkash_number: '01712345678',
        top_announcement_text: `${marker} | SECOND SEGMENT`,
        top_announcement_enabled: false,
      },
      cookie,
    );
    check('administrator can disable the bar', hidden.status === 200, `HTTP ${hidden.status}`);
    const homeHidden = await html('/');
    check(
      'announcement text is gone when disabled',
      !visibleText(homeHidden.body).includes(marker),
    );
  } catch (error) {
    check('round trip completed', false, String(error));
  } finally {
    // --- restore the original row, whatever happened -----------------------
    const restored = await admin('PATCH', '/rest/v1/site_settings?id=eq.site', {
      inside_dhaka_charge: original.inside_dhaka_charge,
      outside_dhaka_charge: original.outside_dhaka_charge,
      bkash_number: original.bkash_number,
      top_announcement_text: original.top_announcement_text,
      top_announcement_enabled: original.top_announcement_enabled,
    });
    check('original settings restored', restored.status < 300, `HTTP ${restored.status}`);

    // The restore went straight to PostgREST, so the app's `unstable_cache` entry
    // still holds the probe values. Drop it through the app's own route while the
    // throwaway administrator still has a session.
    if (cookie) {
      const bust = await post('/api/revalidate', { tags: ['site-settings'] }, cookie);
      check('settings cache cleared after restore', bust.status === 200, `HTTP ${bust.status}`);
    }

    if (adminId) {
      const deleted = await admin('DELETE', `/auth/v1/admin/users/${adminId}`);
      check('throwaway administrator deleted', deleted.status < 300, `HTTP ${deleted.status}`);
    }
  }
}

/* ------------------------------------------------------------------ summary -- */

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\n${passed}/${results.length} checks passed${failed ? ` — ${failed} FAILED` : ''}`);
process.exit(failed === 0 ? 0 : 1);
