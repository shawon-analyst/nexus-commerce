import { PHONE_ALIAS_DOMAIN, formatBdPhone } from './phone';

/**
 * Which e-mail addresses are fit to show a human — and which are an
 * implementation detail.
 *
 * A shopper who registered with a mobile number has **no e-mail address at all**.
 * The `…@phone.nexuscommerce.dev` address is a stand-in that exists purely so
 * Supabase Auth has an identity to hash a password against (`lib/phone.ts`); it
 * has no mailbox and means nothing to the customer. The QA seed accounts use the
 * shop's own `nexuscommerce.dev` domain, which is the same kind of machinery.
 *
 * Rendering either one in the account card, the header, the admin users table or
 * an "X was deleted" toast tells the shop owner something untrue about the
 * account, so every display site reads `displayEmail()` / `accountDetail()`
 * instead of touching `profile.email` directly.
 *
 * `nexuscommerce.dev` is also the domain `support@` is on, but that mailbox is
 * never an *account* address — no customer ever registers with it — so the whole
 * domain is treated as generated. Searching the admin table still matches the raw
 * value, so a support agent can still find an account by typing its alias.
 *
 * The import above is deliberately relative:
 * `scripts/qa/phone-probe.mjs` compiles these two files on their own with the
 * project's `tsc`, which does not know about the `@/` path alias.
 */
export const GENERATED_EMAIL_DOMAINS: readonly string[] = [PHONE_ALIAS_DOMAIN, 'nexuscommerce.dev'];

/** Shown wherever an account has no reachable e-mail address. */
export const NO_EMAIL_LABEL = 'No email linked';

/** True for an address the shop generated rather than the shopper supplying it. */
export function isGeneratedEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  const lower = email.trim().toLowerCase();
  if (!lower.includes('@')) return false;
  return GENERATED_EMAIL_DOMAINS.some((domain) => lower.endsWith(`@${domain}`));
}

/**
 * The address worth showing, or `null` when there is not one.
 *
 * A value that is missing, blank, or generated all collapse to `null` so the
 * caller has exactly one "nothing to show" case to handle.
 */
export function displayEmail(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim();
  if (!trimmed || isGeneratedEmail(trimmed)) return null;
  return trimmed;
}

/**
 * One line of identity under a name: the real e-mail when there is one, else the
 * mobile number the account signs in with.
 */
export function accountDetail(input: { email?: string | null; phone?: string | null }): string {
  const email = displayEmail(input.email);
  if (email) return email;
  if (input.phone?.trim()) return formatBdPhone(input.phone);
  return NO_EMAIL_LABEL;
}

/**
 * How to name an account inside a sentence — "…was deleted", "Role for …",
 * "…is now Admin". Never the generated address.
 */
export function accountLabel(input: {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const name = input.full_name?.trim();
  if (name) return name;
  const email = displayEmail(input.email);
  if (email) return email;
  if (input.phone?.trim()) return formatBdPhone(input.phone);
  return 'This account';
}
