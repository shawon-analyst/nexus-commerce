import {
  BKASH_NUMBER,
  DELIVERY_AREA_META,
  DEFAULT_DELIVERY_AREA,
  deliveryAreaMeta,
} from '@/lib/utils';
import type { DeliveryArea } from '@/lib/types';

/**
 * The storefront's editable configuration, as the shop reads it.
 *
 * This module is **client-safe** on purpose: the checkout, the cart and the
 * announcement bar all need these values, and none of them may import
 * `lib/queries.ts` (which pulls in `next/headers`). The server loader lives in
 * `lib/queries.ts` and returns this exact shape.
 *
 * `DEFAULT_SITE_SETTINGS` is not decoration — it is the fallback for a database
 * where `0014_site_settings.sql` has not been applied yet, or where the row has
 * been removed. The shop must keep selling at the documented ৳60 / ৳120 rather
 * than crash or ship for free.
 */
export type SiteSettings = {
  insideDhakaCharge: number;
  outsideDhakaCharge: number;
  /**
   * Reserved. Stored by the database but deliberately unused: the shop's
   * free-delivery threshold was retired in `0012_delivery_area.sql`, so the fee
   * applies to every order. Kept in the type so the column is not a mystery.
   */
  freeShippingThreshold: number | null;
  bkashNumber: string;
  topAnnouncementText: string;
  topAnnouncementEnabled: boolean;
};

/** The bKash wallet the shop publishes, from the compiled fallback. */
export const FALLBACK_BKASH_NUMBER = BKASH_NUMBER;

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  insideDhakaCharge: DELIVERY_AREA_META.inside.fee,
  outsideDhakaCharge: DELIVERY_AREA_META.outside.fee,
  freeShippingThreshold: null,
  bkashNumber: FALLBACK_BKASH_NUMBER,
  topAnnouncementText: '',
  topAnnouncementEnabled: true,
};

/**
 * The delivery charge for an area, using the live settings.
 *
 * An unknown area falls back to the Inside-Dhaka fee rather than 0 — a bad value
 * must never ship for free. Mirrors `deliveryFeeFor()` in `lib/utils.ts`, which
 * stays as the static fallback for code that has no settings in hand.
 */
export function deliveryFeeFromSettings(
  area: string | null | undefined,
  settings: SiteSettings = DEFAULT_SITE_SETTINGS,
): number {
  return (area ?? DEFAULT_DELIVERY_AREA) === 'outside'
    ? settings.outsideDhakaCharge
    : settings.insideDhakaCharge;
}

/** Area metadata with the *live* fee swapped in, for the checkout's radio cards. */
export function deliveryAreaMetaFromSettings(
  area: string | null | undefined,
  settings: SiteSettings = DEFAULT_SITE_SETTINGS,
) {
  const meta = deliveryAreaMeta(area);
  return { ...meta, fee: deliveryFeeFromSettings(area, settings) };
}

/**
 * Turns the announcement column into ticker segments.
 *
 * The admin types one line and may separate several with `|` — the example in
 * the settings form is exactly that. Empty entries are dropped, so a trailing
 * pipe or a line of spaces cannot render an empty ticker slot.
 */
export function announcementSegments(settings: SiteSettings): string[] {
  return settings.topAnnouncementText
    .split('|')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** Where the parcel goes, as a typed value — shared by the settings form and SQL. */
export const SETTINGS_DELIVERY_AREAS: DeliveryArea[] = ['inside', 'outside'];