/*
 * Verifies the password-management surface on a running server: the
 * server-assisted mobile sign-in, the recovery-address change, and the two
 * password endpoints in the admin console.
 *
 *   node scripts/qa/password-probe.mjs        # add PROBE_BASE=… for another port
 *
 * The first half needs only `.env.local` and a server; it proves the guard rails
 * — malformed input, unknown numbers and unauthenticated calls are all refused
 * without the response revealing whether an account exists.
 *
 * The second half walks the whole mobile-account journey that this round exists
 * to serve: a number registered with no mailbox of its own, signing in, linking
 * a recovery address with its current password, and signing in again afterwards.
 * That needs to *write*, so it provisions two throwaway accounts with the
 * service-role Admin API and deletes them again in a `finally`, profile rows
 * included. Nothing belonging to a real shopper is touched, and no e-mail is
 * sent by the probe itself (`email_confirm: true` skips the round trip) — one
 * check does ask `/api/auth/recover` to send, so its `429` answer is accepted.
 *
 * If no server answers, the HTTP half is reported as skipped rather than failed,
 * the same convention `auth-probe.mjs` uses.
 */
import { randomInt } from 'node:crypto';
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

/** A POST to one of the app's own routes; returns status, parsed body, cookies. */
async function post(path, body, { cookie, raw } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: raw ?? JSON.stringify(body),
    redirect: 'manual',
  });

  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    /* an empty or non-JSON body is a finding in itself */
  }

  const setCookies =
    response.headers.getSetCookie?.() ??
    (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);

  return { status: response.status, body: parsed, setCookies };
}

/** A request to one of the app's own routes with a method other than POST. */
async function send(method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    /* ignore */
  }
  return { status: response.status, body: parsed };
}

/** `Set-Cookie` headers → a `Cookie:` header value. */
const jar = (setCookies) => setCookies.map((line) => line.split(';')[0]).join('; ');

/** The Admin API shape used for the throwaway fixtures. */
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

/** GoTrue's own password grant, so the probe can see the auth address directly. */
async function signInWithPassword(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return response.status;
}

/* ========================================================================== */
/*  1. The guard rails — no account needed                                    */
/* ========================================================================== */

console.log('\n=== the routes, with nothing to offer them ===');

let serverUp = false;
try {
  serverUp = (await fetch(`${BASE}/login`, { redirect: 'manual' })).status < 500;
} catch {
  serverUp = false;
}

if (!serverUp) {
  skip('every route check', `no server on ${BASE} — start one with NEXT_DIST_DIR=.next-build npx next start -p 3100`);
} else {
  const garbage = await post('/api/auth/phone-signin', null, { raw: 'not json at all' });
  check(
    'mobile sign-in · a body that is not JSON is a 400, not a 500',
    garbage.status === 400 && garbage.body?.error === 'INVALID_JSON',
    `${garbage.status} ${garbage.body?.error ?? ''}`,
  );

  const short = await post('/api/auth/phone-signin', { phone: '123', password: 'whatever' });
  check(
    'mobile sign-in · a number that cannot be one is refused',
    short.status === 400 && short.body?.error === 'INVALID_PHONE',
    `${short.status} ${short.body?.error ?? ''}`,
  );

  const unknown = await post('/api/auth/phone-signin', {
    phone: '01900000000',
    password: 'not-the-password',
  });
  check(
    'mobile sign-in · an unknown number and a wrong password answer the same',
    unknown.status === 401 && unknown.body?.error === 'INVALID_CREDENTIALS',
    `${unknown.status} ${unknown.body?.error ?? ''}`,
  );
  check(
    'mobile sign-in · a failure answers with nothing but the error',
    JSON.stringify(Object.keys(unknown.body ?? {}).sort()) === '["error"]',
    Object.keys(unknown.body ?? {}).join(', '),
  );

  const strayRecover = await post('/api/auth/recover', { phone: 'not a number' });
  check(
    'recovery · a body that is not a number is refused',
    strayRecover.status === 400 && strayRecover.body?.status === 'invalid',
    `${strayRecover.status} ${strayRecover.body?.status ?? ''}`,
  );

  const guarded = await Promise.all([
    post('/api/account/recovery-email', { email: 'a@b.com', password: 'x' }),
    post('/api/admin/users', { email: 'a@b.com', password: 'x' }),
    send('PATCH', '/api/admin/users', { user_id: 'x', password: 'x' }),
    send('DELETE', '/api/admin/users', { user_id: 'x' }),
  ]);
  for (const [label, response] of [
    ['linking a recovery address', guarded[0]],
    ['creating an account', guarded[1]],
    ['setting a password', guarded[2]],
    ['deleting an account', guarded[3]],
  ]) {
    check(
      `an anonymous caller cannot do “${label}”`,
      response.status === 401 && response.body?.error === 'AUTH_REQUIRED',
      `${response.status} ${response.body?.error ?? ''}`,
    );
  }

  if (!SERVICE_KEY) {
    skip('the live journey', 'SUPABASE_SERVICE_ROLE_KEY is not set in .env.local');
  } else {
    /* ====================================================================== */
    /*  2. A mobile account, all the way to a linked recovery address         */
    /* ====================================================================== */

    console.log('\n=== a mobile account linking a recovery address ===');

    const stamp = Date.now();
    const canonical = `019${String(randomInt(0, 100000000)).padStart(8, '0')}`;
    const lone = `019${String(randomInt(0, 100000000)).padStart(8, '0')}`;
    const alias = `${canonical}@phone.nexuscommerce.dev`;
    const loneAlias = `${lone}@phone.nexuscommerce.dev`;
    const recovery = `qa.pwmgt.${stamp}@gmail.com`;
    const password = 'Probe-pass-1234';

    const fixtures = [];

    try {
      const created = await admin('POST', '/auth/v1/admin/users', {
        email: alias,
        password,
        email_confirm: true,
        user_metadata: { phone: canonical, full_name: 'QA Password Probe' },
      });
      check(
        'a mobile account can be provisioned for the walk-through',
        created.status === 200 || created.status === 201,
        `${created.status} ${created.body?.msg ?? created.body?.id ?? ''}`,
      );
      fixtures.push(created.body?.id);

      const loneCreated = await admin('POST', '/auth/v1/admin/users', {
        email: loneAlias,
        password,
        email_confirm: true,
        user_metadata: { phone: lone, full_name: 'QA No Recovery Probe' },
      });
      fixtures.push(loneCreated.body?.id);

      const userId = created.body?.id;

      // The trigger copies `user_metadata.phone` onto the profile, which is what
      // the sign-in fallback looks the account up by.
      const profile = await admin(
        'GET',
        `/rest/v1/profiles?id=eq.${userId}&select=email,phone,role`,
      );
      const row = Array.isArray(profile.body) ? profile.body[0] : null;
      check(
        'the profile carries the canonical number the trigger copied',
        row?.phone === canonical,
        `phone = ${row?.phone}`,
      );
      check(
        'the profile mirror starts out holding the generated alias',
        row?.email === alias,
        `email = ${row?.email}`,
      );

      /* -- sign in with the number spelled the way a shopper would ---------- */

      const spelled = await post('/api/auth/phone-signin', {
        // The same number, grouped the way a shopper reads it: 01934 100750.
        phone: canonical.replace(/^(\d{5})/, '$1 '),
        password,
      });
      check(
        'a spaced-out spelling of the number still signs in',
        spelled.status === 200 && spelled.body?.ok === true,
        `${spelled.status} ${spelled.body?.error ?? ''}`,
      );
      check(
        'the sign-in answers with a destination, and nothing else',
        JSON.stringify(Object.keys(spelled.body ?? {}).sort()) === '["ok","redirectTo"]',
        Object.keys(spelled.body ?? {}).join(', '),
      );
      check(
        'a customer lands on the storefront home',
        spelled.body?.redirectTo === '/',
        spelled.body?.redirectTo ?? 'n/a',
      );

      const sessionCookie = jar(spelled.setCookies);
      check(
        'the response carries a Supabase session cookie',
        /sb-[^=]*-auth-token/.test(sessionCookie),
        sessionCookie.split('; ')[0]?.split('=')[0] ?? 'none',
      );
      check(
        'that cookie carries a real token, not an empty value',
        /-auth-token(\.\d+)?=[^;]{20,}/.test(sessionCookie),
      );

      const account = await fetch(`${BASE}/account`, {
        headers: { cookie: sessionCookie },
        redirect: 'manual',
      });
      check(
        'that cookie is a real session — /account opens with it',
        account.status === 200,
        `GET /account → ${account.status}`,
      );
      check(
        'the body of the sign-in response never carries the address',
        !JSON.stringify(spelled.body).includes('@'),
      );

      const wrong = await post('/api/auth/phone-signin', { phone: canonical, password: 'nope' });
      check(
        'the right number with the wrong password is still refused',
        wrong.status === 401,
        `${wrong.status} ${wrong.body?.error ?? ''}`,
      );

      /* -- link a recovery address ------------------------------------------ */

      const internal = await post(
        '/api/account/recovery-email',
        { email: `someone@${'nexuscommerce'}.dev`, password },
        { cookie: sessionCookie },
      );
      check(
        'a shop-internal address is refused as a recovery address',
        internal.status === 400 && internal.body?.error === 'INVALID_EMAIL',
        `${internal.status} ${internal.body?.error ?? ''}`,
      );

      const badPassword = await post(
        '/api/account/recovery-email',
        { email: recovery, password: 'not-the-password' },
        { cookie: sessionCookie },
      );
      check(
        'linking an address needs the current password, not just the session',
        badPassword.status === 403 && badPassword.body?.error === 'INVALID_PASSWORD',
        `${badPassword.status} ${badPassword.body?.error ?? ''}`,
      );

      const linked = await post(
        '/api/account/recovery-email',
        { email: recovery, password },
        { cookie: sessionCookie },
      );
      check(
        'the right password links the recovery address',
        linked.status === 200 && linked.body?.ok === true,
        `${linked.status} ${linked.body?.error ?? ''}`,
      );

      const after = await admin(
        'GET',
        `/rest/v1/profiles?id=eq.${userId}&select=email`,
      );
      check(
        'the profiles mirror follows in the same request, so the admin table is right at once',
        after.body?.[0]?.email === recovery,
        `email = ${after.body?.[0]?.email}`,
      );

      /* -- the address really moved ----------------------------------------- */

      const aliasNow = await signInWithPassword(alias, password);
      check(
        'the generated alias stops working, so the address really moved',
        aliasNow === 400,
        `alias sign-in → ${aliasNow}`,
      );

      const recoveryNow = await signInWithPassword(recovery, password);
      check(
        'the linked address is now a working sign-in address',
        recoveryNow === 200,
        `recovery-email sign-in → ${recoveryNow}`,
      );

      const reSignIn = await post('/api/auth/phone-signin', { phone: canonical, password });
      check(
        'the mobile number keeps working even though the alias is gone',
        reSignIn.status === 200 && reSignIn.body?.ok === true,
        `${reSignIn.status} ${reSignIn.body?.error ?? ''}`,
      );

      /* -- and recovery can now reach a real mailbox ------------------------ */

      const recover = await post('/api/auth/recover', { phone: canonical });
      check(
        'a number with a linked address is told a link was sent',
        ['sent', 'rate-limited'].includes(recover.body?.status),
        `${recover.status} ${recover.body?.status ?? ''}`,
      );

      const noEmail = await post('/api/auth/recover', { phone: lone });
      const stranger = await post('/api/auth/recover', { phone: '01900000000' });
      check(
        'a number with no linked address is told exactly that',
        noEmail.body?.status === 'no-recovery-email',
        `${noEmail.status} ${noEmail.body?.status ?? ''}`,
      );
      check(
        'an unregistered number answers the same, so the route cannot be used to find accounts',
        stranger.body?.status === noEmail.body?.status,
        `unknown → ${stranger.body?.status} vs registered → ${noEmail.body?.status}`,
      );
    } finally {
      for (const id of fixtures.filter(Boolean)) {
        await admin('DELETE', `/auth/v1/admin/users/${id}`);
        await admin('DELETE', `/rest/v1/profiles?id=eq.${id}`);
      }
      console.log(`\n(cleaned up ${fixtures.filter(Boolean).length} throwaway accounts)`);
    }
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n=== password probe: ${results.length - failed}/${results.length} passed ===`);
process.exit(failed ? 1 : 0);
