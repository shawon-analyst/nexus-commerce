# QA harnesses

Runnable checks for the things unit tests cannot cover: the **live** Supabase
project's row-level security, and the **rendered** output of a running server
(share cards, robots, sitemap, e-mail templates). Each script prints one
`PASS`/`FAIL` line per assertion and exits non-zero if anything fails, so they
slot into CI as-is.

They read `.env.local` from the repository root. Nothing here writes to the
database — the only mutation is a deliberate, refused privilege-escalation
attempt.

| Harness | What it proves | Needs |
| --- | --- | --- |
| `rls-probe.mjs` | a signed-in **customer** cannot read another user's orders, order items or profile through the REST API, anonymous requests return nothing, and self-promotion to `admin` is refused | `.env.local` (anon + service-role keys) |
| `seo-probe.mjs` | `og:*` / `twitter:*` share cards, canonical URLs, title template, `robots.txt`, `sitemap.xml`, `noindex` on private pages, the two policy pages (fetched with Meta's own crawler user-agent) and the security headers | a server running on `:3100` |
| `email-probe.mjs` | the order-confirmation template's numbers and escaping, and the notify route's auth guards | a server on `:3000` **plus** a throwaway preview route (see the file header) |
| `image-probe.mjs` | allow-listed image hosts still optimise and an attacker-chosen host is refused — the boundary that keeps the `/_next/image` advisories off the table | a server (default `:3100`) + `.env.local` |
| `auth-probe.mjs` | the OAuth parameters the app sends reach the provider intact (`prompt=select_account` for Google), that Facebook is switched off in the project *and* can no longer reach facebook.com, and that `/auth/callback` fails soft, is uncacheable and refuses open redirects | `.env.local`; the callback half additionally wants a server on `:3100` |
| `phone-probe.mjs` | the mobile-number rules behind sign-in: every spelling of one number collapses to one alias address, 013-019 are accepted and 012 is not, the reserved alias domain is refused on the email tab, and the shared password policy | nothing (compiles `lib/phone.ts` + `lib/password.ts` with the project's own `tsc`) |

## RLS

```bash
node scripts/qa/rls-probe.mjs
```

Signs in as the QA customer account in `.env.local`'s project and compares what
that session can read with what the **service role** can see, so a filter that
merely returns nothing is not mistaken for a policy that works. If the QA login
no longer exists it provisions a throwaway account and deletes it again.

## SEO & sharing

```bash
# a production build, in its own folder so the dev server's .next is untouched
$env:NEXT_DIST_DIR='.next-build'; npx next build; npx next start -p 3100
node scripts/qa/seo-probe.mjs        # PROBE_ORIGIN must match the build's NEXT_PUBLIC_SITE_URL
```

`PROBE_BASE` and `PROBE_ORIGIN` override the defaults. To check that the
environment really drives the output, build once with
`NEXT_PUBLIC_SITE_URL=https://example.com` and run with
`PROBE_ORIGIN=https://example.com` — every URL in the assertions should follow.

It also covers the two **legal pages**. They are fetched with Meta's own
`facebookexternalhit` crawler user-agent, because that is the client a provider
uses when it reviews an app: each must answer 200 without a session (never a
redirect to `/login`), declare a canonical URL and a share card, emit breadcrumb
structured data, and — for `/privacy` — contain the `data-deletion` anchor that
Meta's *Data Deletion Instructions URL* field points at. Finally it asserts the
policies really are linked from the storefront footer and the sign-in screen, so
they cannot become orphaned pages that only resolve when typed by hand.

## Order e-mail

```bash
node scripts/qa/email-probe.mjs
```

Needs the temporary preview route described at the top of the file; it is not
shipped with the app, because a route that exists only for tests has no business
being reachable in production.

## Image allow-list

```bash
node scripts/qa/image-probe.mjs        # or PROBE_BASE=… for a dev server
```

Reads real image URLs out of the database, optimises them through
`/_next/image`, and then asserts that three attacker-chosen hosts are refused —
including the `images.unsplash.com.evil.example.com` suffix trick.

## Sign-in

```bash
node scripts/qa/auth-probe.mjs         # add PROBE_BASE=… to also test the callback
node scripts/qa/phone-probe.mjs        # the identifier rules, no server needed
```

`auth-probe.mjs` has two halves. The provider half calls `/auth/v1/authorize` with
`redirect: 'manual'` and reads the `Location` header, so it sees exactly what
GoTrue hands Google without starting a flow — no account is created and no e-mail
is sent. It pins the parameter that is easy to get wrong: Google needs
`prompt=select_account` or it silently reuses the browser's existing session. It
also reads the public `/auth/v1/settings` and asserts that the Facebook provider
is **off**, and that a Facebook sign-in can no longer reach `facebook.com` — the
half of the removal that a deleted button does not cover.

The callback half needs a server. It checks that a spent code, a bare call and a
provider denial all redirect to `/login` (or `/forgot-password` for recovery)
rather than 500-ing, that the response is `no-store`, and that `redirectTo` /
`next` pointing at another origin are ignored.

`phone-probe.mjs` covers mobile-number sign-in, which rests on one property: every
spelling of a number (`01712 345678`, `+8801712345678`, `1712345678`,
`008801712345678`, …) must collapse to a single alias address, or one shopper ends
up with two accounts. It compiles `lib/phone.ts` and `lib/password.ts` with the
project's own `tsc` into a temp directory and requires the result, so the pure
rules get a real table of cases with no browser and no server.

## Related, kept outside the repo

A `verify-rbac.ps1` harness (plus its `rbaccheck.sql`) used during the staff-role
work runs the migration chain against a **scratch** Postgres to prove the schema
and the RBAC behaviour stay identical across rewrites. It needs a throwaway
cluster on port `55433` and is not included here because it depends on a local
Postgres install.
