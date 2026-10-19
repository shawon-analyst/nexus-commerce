import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { SETTINGS_TAG } from '@/lib/cache-tags';
import { normalizeBdPhone } from '@/lib/phone';
import { toNumber } from '@/lib/utils';
import type { SiteSettingsRow } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Saves the singleton `site_settings` row (`/admin/settings`).
 *
 * Authorisation is `is_admin()`, checked with the caller's own session — the
 * service-role key is not involved. The RLS policy on the table says the same
 * thing (`site_settings_admin_update`), so this route and a hand-rolled REST call
 * end up at the same barrier. Operators are refused: an operator runs orders and
 * stock, an administrator owns the prices.
 *
 * Everything is validated before the write, and the response carries the saved
 * row so the form can show exactly what the database now holds (rather than what
 * the browser hoped it sent).
 */

const MAX_CHARGE = 100_000;
const MAX_ANNOUNCEMENT = 600;

function fail(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, ...(detail ? { detail } : {}) }, { status });
}

type ParsedCharge = { ok: true; value: number } | { ok: false };

/** Accepts `60`, `60.5`, `"60"` — rejects negatives, NaN, Infinity and > 100000. */
function parseCharge(value: unknown): ParsedCharge {
  if (typeof value !== 'number' && typeof value !== 'string') return { ok: false };
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return { ok: false };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_CHARGE) return { ok: false };
  // Money is stored as numeric(12,2); round rather than let Postgres truncate.
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export async function POST(request: Request) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, 'AUTH_REQUIRED');

  const { data: isAdmin, error: guardError } = await supabase.rpc('is_admin');
  if (guardError) {
    return fail(
      500,
      'SCHEMA_NOT_READY',
      `is_admin() failed: ${guardError.message} — check that the base migrations are applied.`,
    );
  }
  if (!isAdmin) return fail(403, 'NOT_AUTHORIZED');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail(400, 'INVALID_JSON');
  }

  const inside = parseCharge(body.inside_dhaka_charge);
  if (!inside.ok) {
    return fail(400, 'INVALID_CHARGE', 'The Inside Dhaka fee must be a number between 0 and 100000.');
  }

  const outside = parseCharge(body.outside_dhaka_charge);
  if (!outside.ok) {
    return fail(
      400,
      'INVALID_CHARGE',
      'The Outside Dhaka fee must be a number between 0 and 100000.',
    );
  }

  // The wallet must be a real Bangladeshi mobile number: the checkout prints it
  // for people to send money to, and a typo there is money sent to a stranger.
  const rawBkash = typeof body.bkash_number === 'string' ? body.bkash_number.trim() : '';
  const bkash = normalizeBdPhone(rawBkash);
  if (!bkash) {
    return fail(400, 'INVALID_PHONE', 'Enter the bKash wallet as a Bangladeshi mobile number.');
  }

  const announcement =
    typeof body.top_announcement_text === 'string' ? body.top_announcement_text.trim() : '';
  if (announcement.length > MAX_ANNOUNCEMENT) {
    return fail(
      400,
      'ANNOUNCEMENT_TOO_LONG',
      `Keep the announcement under ${MAX_ANNOUNCEMENT} characters.`,
    );
  }

  if (typeof body.top_announcement_enabled !== 'boolean') {
    return fail(400, 'INVALID_TOGGLE');
  }

  const { data, error } = await supabase
    .from('site_settings')
    .update({
      inside_dhaka_charge: inside.value,
      outside_dhaka_charge: outside.value,
      bkash_number: bkash,
      top_announcement_text: announcement,
      top_announcement_enabled: body.top_announcement_enabled,
      // `touch_updated_at()` handles the timestamp; recording the editor is
      // useful when a price looks wrong later.
      updated_by: user.id,
    })
    .eq('id', 'site')
    .select('*')
    .maybeSingle();

  if (error) {
    // A missing table means the migration has not been applied. Say so plainly
    // instead of surfacing "relation does not exist" to a shop owner.
    const missing = /relation .*site_settings.* does not exist|Could not find the table/i.test(
      error.message,
    );
    return fail(
      missing ? 503 : 500,
      missing ? 'MIGRATION_REQUIRED' : 'UPDATE_FAILED',
      missing
        ? 'Run supabase/migrations/0014_site_settings.sql in the Supabase SQL editor, then reload this page.'
        : error.message,
    );
  }

  if (!data) {
    return fail(
      503,
      'SETTINGS_ROW_MISSING',
      'The settings row is missing. Re-run 0014_site_settings.sql to restore it.',
    );
  }

  // The storefront reads these through `unstable_cache`. Drop the tag so the new
  // fee and announcement are live on the next request, and revalidate the layout
  // so the provider re-seeds every client component (cart, checkout, ticker).
  revalidateTag(SETTINGS_TAG);
  revalidatePath('/', 'layout');

  const saved = data as SiteSettingsRow;

  return NextResponse.json({
    ok: true,
    settings: {
      insideDhakaCharge: toNumber(saved.inside_dhaka_charge),
      outsideDhakaCharge: toNumber(saved.outside_dhaka_charge),
      bkashNumber: saved.bkash_number,
      topAnnouncementText: saved.top_announcement_text,
      topAnnouncementEnabled: saved.top_announcement_enabled,
      updatedAt: saved.updated_at,
    },
  });
}
