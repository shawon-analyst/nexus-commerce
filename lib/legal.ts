/**
 * Shared facts about the two policy documents.
 *
 * Meta (and every other OAuth provider) requires an app to publish a privacy
 * policy at a public URL that never redirects to a sign-in screen, and to expose
 * a **user data deletion** route. Both live here so the pages, the footer and the
 * QA probe agree on one set of URLs.
 */

/** Bump this whenever the wording of either policy materially changes. */
export const LEGAL_LAST_UPDATED = 'October 18, 2026';

/**
 * The anchor Meta's *Data Deletion Instructions URL* field points at. If this is
 * ever renamed, `/privacy#data-deletion` stops resolving — `scripts/qa/seo-probe.mjs`
 * asserts it exists.
 */
export const DATA_DELETION_ANCHOR = 'data-deletion';

export const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
] as const;
