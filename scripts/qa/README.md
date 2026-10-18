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
| `seo-probe.mjs` | `og:*` / `twitter:*` share cards, canonical URLs, title template, `robots.txt`, `sitemap.xml`, `noindex` on private pages and the security headers | a server running on `:3100` |
| `email-probe.mjs` | the order-confirmation template's numbers and escaping, and the notify route's auth guards | a server on `:3000` **plus** a throwaway preview route (see the file header) |
| `image-probe.mjs` | allow-listed image hosts still optimise and an attacker-chosen host is refused — the boundary that keeps the `/_next/image` advisories off the table | a server (default `:3100`) + `.env.local` |

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

## Related, kept outside the repo

A `verify-rbac.ps1` harness (plus its `rbaccheck.sql`) used during the staff-role
work runs the migration chain against a **scratch** Postgres to prove the schema
and the RBAC behaviour stay identical across rewrites. It needs a throwaway
cluster on port `55433` and is not included here because it depends on a local
Postgres install.
