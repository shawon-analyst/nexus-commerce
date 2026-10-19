/**
 * Mobile-number sign-in, without an SMS bill.
 *
 * Supabase Auth *can* sign in with `phone` + a password, but only when the Phone
 * provider is enabled **and** a paid SMS provider (Twilio, MessageBird, Vonage)
 * is configured — every verification costs a message, and the live project
 * currently reports `external.phone = false`. This storefront needs phone
 * sign-in today, so a number is mapped onto the e-mail identity that Supabase
 * already handles well:
 *
 *     01712 345678   →   01712345678@phone.nexuscommerce.dev
 *
 * The canonical number is also written to `profiles.phone`, so every other part
 * of the app — checkout prefill, order records, admin user search — sees the
 * number the shopper typed, while Auth sees a stable e-mail address.
 *
 * Two consequences are deliberate and are stated plainly in the UI and the
 * Privacy Policy:
 *
 *  1. The number is **not** SMS-verified, so a typo (or somebody else's number)
 *     still creates a working account.
 *  2. Nothing may ever be *sent* to the alias domain, so password recovery for a
 *     mobile-only account is handled by support rather than by e-mail.
 *     `isPhoneAliasEmail()` exists so no screen can forget that.
 *
 * Moving to real, SMS-verified phone auth later is a provider switch plus the
 * `verifyOtp` branch described in README § "Mobile number accounts" — the
 * normalisation below stays exactly as it is.
 */

/** Ours alone. Kept off any real mail domain, so nothing can ever be delivered. */
export const PHONE_ALIAS_DOMAIN = 'phone.nexuscommerce.dev';

/** How the shopper identified themselves on the sign-in screen. */
export type IdentifierMode = 'email' | 'phone';

/** Every Bangladeshi mobile number is 11 digits: `01`, then 3-9, then 8 more. */
const BD_MOBILE_RE = /^01[3-9]\d{8}$/;

/**
 * Accepts every shape a shopper might reasonably type and returns the single
 * canonical form, or `null` when it is not a Bangladeshi mobile number.
 *
 *   01712345678       01712-345678      01712 345678
 *   1712345678        +8801712345678    8801712345678
 *   008801712345678   (+880) 1712 345678
 *                                            →  01712345678
 *
 * Order matters: the international prefixes are peeled off first, and only then
 * is the local form rebuilt, so `880…` can never be mistaken for a local number
 * and a local number can never be truncated into one.
 */
/**
 * Peel the international prefixes and the missing leading zero.
 *
 * Shared with `resolveSignInIdentifier` so the error copy can tell "too short /
 * too long" apart from "right length, wrong prefix" — `01212345678` is eleven
 * digits and still not a mobile number, and telling the shopper to "enter an
 * 11-digit number" when they just did would be maddening.
 */
function toLocalDigits(input: string): string {
  let digits = (input ?? '').replace(/\D/g, '');

  if (digits.startsWith('00')) digits = digits.slice(2); // 00 880 …
  if (digits.startsWith('880') && digits.length === 13) digits = digits.slice(3); // 880 1…
  if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`; // 1…

  return digits;
}

export function normalizeBdPhone(input: string): string | null {
  const digits = toLocalDigits(input);
  return BD_MOBILE_RE.test(digits) ? digits : null;
}

export function isBdPhone(input: string): boolean {
  return normalizeBdPhone(input) !== null;
}

/** The address Supabase Auth actually stores for a mobile number. */
export function toPhoneAlias(canonical: string): string {
  return `${canonical}@${PHONE_ALIAS_DOMAIN}`;
}

/**
 * True for the synthetic addresses above. Every screen that can send mail checks
 * this first — a recovery e-mail aimed at the alias domain would bounce and
 * quietly burn sending reputation.
 */
export function isPhoneAliasEmail(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false;
  return email.trim().toLowerCase().endsWith(`@${PHONE_ALIAS_DOMAIN}`);
}

/** The reverse of `toPhoneAlias`, for labelling an account that has signed in. */
export function phoneFromAliasEmail(email: string | null | undefined): string | null {
  if (!isPhoneAliasEmail(email)) return null;
  return normalizeBdPhone(String(email).split('@')[0]);
}

/** `01712345678` → `01712 345678`: how the number is written on the form. */
export function formatBdPhone(input: string): string {
  const canonical = normalizeBdPhone(input);
  return canonical ? `${canonical.slice(0, 5)} ${canonical.slice(5)}` : (input ?? '');
}

export type ResolvedIdentifier =
  | { ok: true; email: string; /** canonical number, on the mobile tab */ phone: string | null }
  | { ok: false; error: string };

/**
 * Turns whatever was typed into the e-mail Supabase should see, or into a
 * sentence explaining why it cannot.
 *
 * The plain e-mail field refuses the alias domain outright: an account that
 * claimed to *be* `…@phone.nexuscommerce.dev` would be able to shadow a
 * mobile-number account, and the shopper who made the mistake deserves to be
 * pointed at the right tab instead of getting a confusing "invalid credentials".
 */
export function resolveSignInIdentifier(
  mode: IdentifierMode,
  value: string,
): ResolvedIdentifier {
  const raw = (value ?? '').trim();

  if (mode === 'phone') {
    const phone = normalizeBdPhone(raw);
    if (!phone) {
      return {
        ok: false,
        error:
          toLocalDigits(raw).length === 11
            ? 'That is not a Bangladeshi mobile number — they start with 013 to 019.'
            : 'Enter an 11-digit mobile number, for example 01712 345678.',
      };
    }
    return { ok: true, email: toPhoneAlias(phone), phone };
  }

  if (!raw) return { ok: false, error: 'Enter your email address.' };

  if (isPhoneAliasEmail(raw)) {
    return {
      ok: false,
      error: 'Mobile numbers sign in from the Mobile tab — that address is reserved for them.',
    };
  }

  return { ok: true, email: raw, phone: normalizeBdPhone(raw) };
}
