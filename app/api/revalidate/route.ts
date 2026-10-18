import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { INVALIDATABLE_TAGS } from '@/lib/cache-tags';
import { getCurrentProfileResult } from '@/lib/queries';
import { isStaffRole } from '@/lib/utils';

/**
 * Cache-busting endpoint for the admin panel.
 *
 * The storefront catalogue is served from `unstable_cache` (see
 * `lib/queries.ts`) so navigation never waits on PostgREST. That means a staff
 * edit would otherwise stay invisible for up to the revalidate window — this
 * route drops the tag immediately after a successful write.
 *
 * Authorisation is enforced here, server-side: the request must carry a valid
 * *staff* session (`admin` or `operator`). Operators publish products and
 * categories, so gating this on `admin` alone would silently leave their edits
 * off the storefront until the cache expired. The tag allow-list stops a caller
 * from revalidating arbitrary paths.
 */
export async function POST(request: Request) {
  const lookup = await getCurrentProfileResult();

  if (lookup.status !== 'ok' || !isStaffRole(lookup.profile.role)) {
    return NextResponse.json(
      { ok: false, error: lookup.status === 'error' ? 'auth_error' : 'not_authorized' },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const requested = (payload as { tags?: unknown } | null)?.tags;
  const tags = (Array.isArray(requested) ? requested : []).filter(
    (tag): tag is (typeof INVALIDATABLE_TAGS)[number] =>
      typeof tag === 'string' && (INVALIDATABLE_TAGS as readonly string[]).includes(tag),
  );

  for (const tag of tags) revalidateTag(tag);

  return NextResponse.json({ ok: true, revalidated: tags });
}
