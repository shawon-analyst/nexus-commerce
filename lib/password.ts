/**
 * One password policy for every screen that sets one.
 *
 * `reset-password-form` used to carry its own copy of this; the sign-up form
 * needs the same meter, and two duplicated strength tables drift apart the moment
 * one of them is tuned. Supabase's own floor is six characters — eight is the
 * deliberate product choice.
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * A cheap, honest strength signal: length plus variety, no third-party meter and
 * no network call. 0 = empty or unusable, 4 = strong.
 */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(score, 4);
}

/** Index by `passwordStrength()`. Class strings live here so both forms share them. */
export const PASSWORD_STRENGTH_META = [
  { label: '', bar: 'bg-transparent', width: 'w-0' },
  { label: 'Weak', bar: 'bg-destructive', width: 'w-1/4' },
  { label: 'Fair', bar: 'bg-amber-500', width: 'w-2/4' },
  { label: 'Good', bar: 'bg-emerald-500', width: 'w-3/4' },
  { label: 'Strong', bar: 'bg-emerald-500', width: 'w-full' },
] as const;
