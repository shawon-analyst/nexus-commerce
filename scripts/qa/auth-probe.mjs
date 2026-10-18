/*
 * Verifies the social sign-in surface — both the parameters the app sends to
 * GoTrue and the behaviour of `/auth/callback` on a running server.
 *
 *   node scripts/qa/auth-probe.mjs
 *
 * The provider half needs only `.env.local` and never mutates anything: it calls
 * `/auth/v1/authorize` with `redirect: 'manual'` and reads the `Location` header
 * to see what GoTrue hands the provider. It starts no OAuth flow, so no account
 * is ever created and no e-mail is ever sent.
 *
 * The callback half needs a server on `:3100` (override with PROBE_BASE). If no
 * server answers, those checks are reported as skipped rather than failed.
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
/** Mirrors `lib/auth-url.ts`: a real non-localhost origin wins. */
const SITE_URL = env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const ORIGIN =
  /^https?:\/\//i.test(SITE_URL) && !/localhost|127\.0\.0\.1/i.test(SITE_URL)
    ? SITE_URL.replace(/\/$/, '')
    : 'http://localhost:3000';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const skip = (name, why) => console.log(`SKIP  ${name}  — ${why}`);

/** What GoTrue sends the provider for a given set of `/authorize` params. */
async function authorize(params) {
  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { apikey: ANON_KEY }, redirect: 'manual' });
  const location = response.headers.get('location');
  return location ? new URL(location) : null;
}

/*
 * The exact value `authCallbackUrl('/')` produces — no query string — which is
 * what the Google/Facebook button sends when the shopper is heading for the
 * storefront. `lib/auth-url.ts` only appends `?redirectTo=` for deeper targets.
 * The real assertion on that shape lives in the browser probe, which reads the
 * outbound request; here the value only needs to be faithful.
 */
const callbackUrl = `${ORIGIN}/auth/callback`;

console.log(`\n=== provider parameters (${new URL(SUPABASE_URL).host}) ===`);

/* ---------------------------------------------------------------- Google --- */
{
  // Exactly what `SocialAuthButtons` sends: queryParams: { prompt: 'select_account' }.
  const withPrompt = await authorize({
    provider: 'google',
    redirect_to: callbackUrl,
    prompt: 'select_account',
  });
  check(
    'Google · prompt=select_account reaches accounts.google.com',
    withPrompt?.host === 'accounts.google.com' &&
      withPrompt.searchParams.get('prompt') === 'select_account',
    withPrompt?.searchParams.get('prompt') ?? 'not forwarded',
  );

  const withoutPrompt = await authorize({ provider: 'google', redirect_to: callbackUrl });
  check(
    'Google · without the option there is no prompt (the silent sign-in we are avoiding)',
    withoutPrompt?.searchParams.get('prompt') === null,
    String(withoutPrompt?.searchParams.get('prompt')),
  );

  const redirectTo = withPrompt?.searchParams.get('redirect_uri');
  check(
    'Google · Supabase callback is the configured provider redirect_uri',
    redirectTo === `${SUPABASE_URL}/auth/v1/callback`,
    redirectTo ?? 'n/a',
  );
}

/* -------------------------------------------------------------- Facebook --- */
{
  // Exactly what `SocialAuthButtons` sends: scopes: 'public_profile'.
  const withScopes = await authorize({
    provider: 'facebook',
    redirect_to: callbackUrl,
    scopes: 'public_profile',
  });
  const scope = withScopes?.searchParams.get('scope') ?? '';
  const tokens = scope.split(/[\s,]+/).filter(Boolean);

  check(
    'Facebook · requests e-mail and profile',
    tokens.includes('email') && tokens.includes('public_profile'),
    scope || 'n/a',
  );
  check(
    'Facebook · sends no duplicated permission token',
    new Set(tokens).size === tokens.length,
    `${tokens.length} token(s): ${scope || 'n/a'}`,
  );

  /*
   * The shape that used to ship: `scopes: 'email,public_profile'`. GoTrue
   * prepends its own default of `email` and normalises the delimiter itself, so
   * the request carried the permission twice — the regression this probe exists
   * to catch. It is the redundant token that was wrong, not the comma: the
   * comma form and the space form produce byte-identical output.
   */
  const commaForm = await authorize({
    provider: 'facebook',
    redirect_to: callbackUrl,
    scopes: 'email,public_profile',
  });
  const commaScope = commaForm?.searchParams.get('scope') ?? '';
  check(
    'Facebook · the old comma-separated value really did duplicate the scope',
    /email\s+email/.test(commaScope),
    commaScope || 'n/a',
  );

  const spaceForm = await authorize({
    provider: 'facebook',
    redirect_to: callbackUrl,
    scopes: 'email public_profile',
  });
  check(
    'Facebook · GoTrue normalises the delimiter, so only the duplicate mattered',
    (spaceForm?.searchParams.get('scope') ?? '') === commaScope,
    `${spaceForm?.searchParams.get('scope')} === ${commaScope}`,
  );
}

/* ------------------------------------------------------ callback on a server --- */
console.log('\n=== /auth/callback (running server) ===');

let serverUp = false;
try {
  const probe = await fetch(`${BASE}/login`, { redirect: 'manual' });
  serverUp = probe.status < 500;
} catch {
  serverUp = false;
}

if (!serverUp) {
  skip('every /auth/callback check', `no server on ${BASE} — start one with NEXT_DIST_DIR=.next-build npx next start -p 3100`);
} else {
  const hit = async (query) => {
    const response = await fetch(`${BASE}/auth/callback${query}`, { redirect: 'manual' });
    return {
      status: response.status,
      location: response.headers.get('location') ?? '',
      cacheControl: response.headers.get('cache-control') ?? '',
    };
  };

  const bogus = await hit('?code=definitely-not-a-real-code');
  check(
    'a spent/invalid code lands on /login with a reason, not a 500',
    bogus.status >= 300 && bogus.status < 400 && /\/login\?error=/.test(bogus.location),
    `${bogus.status} → ${bogus.location}`,
  );
  check(
    'the callback response is uncacheable',
    /no-store/i.test(bogus.cacheControl),
    bogus.cacheControl || 'no Cache-Control header',
  );

  const bare = await hit('');
  check(
    'a callback with no parameters fails soft',
    bare.status >= 300 && bare.status < 400 && /\/login\?error=auth-callback-failed$/.test(bare.location),
    `${bare.status} → ${bare.location}`,
  );

  const denied = await hit('?error=access_denied');
  check(
    'a provider denial is forwarded verbatim',
    /\/login\?error=access_denied$/.test(denied.location),
    denied.location || 'n/a',
  );

  const recovery = await hit('?error=otp_expired&redirectTo=%2Freset-password');
  check(
    'a dead recovery link goes back to /forgot-password, not /login',
    /\/forgot-password\?error=otp_expired$/.test(recovery.location),
    recovery.location || 'n/a',
  );

  for (const param of ['redirectTo', 'next']) {
    for (const hostile of ['//evil.example.com', 'https://evil.example.com']) {
      const escaped = await hit(`?error=x&${param}=${encodeURIComponent(hostile)}`);
      check(
        `open redirect blocked · ${param}=${hostile}`,
        !escaped.location.includes('evil.example.com'),
        escaped.location || 'n/a',
      );
    }
  }
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n=== auth probe: ${results.length - failed}/${results.length} passed ===`);
process.exit(failed ? 1 : 0);
