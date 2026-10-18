import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type {
  DeliveryArea,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from '@/lib/types';

export type { DeliveryArea };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Supabase numeric columns arrive as strings over the wire. */
export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/* -------------------------------------------------------------------------- */
/*  Money — the shop trades in Bangladeshi Taka (BDT, ৳)                       */
/*  Everything that renders an amount goes through `formatCurrency`, so the    */
/*  symbol, the grouping and the decimal handling live in exactly one place.   */
/* -------------------------------------------------------------------------- */

export const CURRENCY_CODE = 'BDT';
export const CURRENCY_SYMBOL = '৳';

/**
 * `en-BD` gives the western 3-digit grouping Bangladeshi shops use in English
 * copy: 1,200 · 120,000. (Use `en-IN` to switch to lakh/crore grouping.)
 */
const MONEY_LOCALE = 'en-BD';

/**
 * Formats an amount as Taka: `৳ 1,200`, or `৳ 1,200.50` when the amount really
 * does carry poisha. Whole amounts deliberately drop the `.00` — price tags read
 * much better without it.
 */
export function formatCurrency(value: unknown, options: { decimals?: boolean } = {}): string {
  const amount = toNumber(value);
  const hasFraction = Math.abs(amount % 1) > 0.004;
  const withDecimals = options.decimals ?? hasFraction;

  const formatted = new Intl.NumberFormat(MONEY_LOCALE, {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${CURRENCY_SYMBOL} ${formatted}`;
}

/* -------------------------------------------------------------------------- */
/*  Delivery pricing — Inside Dhaka ৳ 60 · Outside Dhaka ৳ 120                 */
/*  The charge depends only on *where* the parcel goes, never on basket size.  */
/*  Everything that quotes or records a fee reads from here, so the cart, the  */
/*  order summary, the invoice and the database cannot disagree.               */
/* -------------------------------------------------------------------------- */

export const DELIVERY_AREA_META: Record<
  DeliveryArea,
  { label: string; labelBn: string; short: string; fee: number; description: string }
> = {
  inside: {
    label: 'Inside Dhaka',
    labelBn: 'ঢাকার ভেতরে',
    short: 'Inside Dhaka',
    fee: 60,
    description: 'Delivered across Dhaka city — usually within 24 hours.',
  },
  outside: {
    label: 'Outside Dhaka',
    labelBn: 'ঢাকার বাইরে',
    short: 'Outside Dhaka',
    fee: 120,
    description: 'Nationwide courier — usually within 48 hours.',
  },
};

/** The area the checkout opens on. */
export const DEFAULT_DELIVERY_AREA: DeliveryArea = 'inside';

/** The areas the checkout offers, in display order. */
export const DELIVERY_AREAS: DeliveryArea[] = ['inside', 'outside'];

/** Safe lookup for a value that may arrive as plain text from Postgres. */
export function deliveryAreaMeta(area: string | null | undefined) {
  return (
    DELIVERY_AREA_META[(area ?? DEFAULT_DELIVERY_AREA) as DeliveryArea] ??
    DELIVERY_AREA_META[DEFAULT_DELIVERY_AREA]
  );
}

/**
 * The delivery charge for an area. An unknown value falls back to the
 * Inside-Dhaka fee rather than 0 — a bad value must never ship for free.
 *
 * ⚠️ `place_order()` in SQL charges the same fees and writes the result into
 * `orders.shipping_fee` + `orders.delivery_area` (it cannot call this file).
 * Moving a number here means moving the matching `c_delivery_inside` /
 * `c_delivery_outside` constants in `place_order()` too — see
 * `0012_delivery_area.sql`.
 */
export function deliveryFeeFor(area: string | null | undefined): number {
  return deliveryAreaMeta(area).fee;
}

export function formatNumber(value: unknown): string {
  return new Intl.NumberFormat(MONEY_LOCALE).format(toNumber(value));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, secs] of units) {
    const value = Math.floor(seconds / secs);
    if (value >= 1) return rtf.format(-value, unit);
  }
  return 'just now';
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(value: string | null | undefined, length = 100): string {
  if (!value) return '';
  return value.length > length ? `${value.slice(0, length).trimEnd()}…` : value;
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const source = (name || email || '?').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * `/login` with a return path — used by every "you must be signed in" prompt so
 * the shopper lands back where they were (the cart survives in localStorage).
 * `redirectTo` must be an app-relative path: the auth pages only forward values
 * that start with a single `/`.
 */
export function signInHref(redirectTo = '/'): string {
  return `/login?redirectTo=${encodeURIComponent(redirectTo)}`;
}

/** `/register` with a return path, so signing up also resumes the flow. */
export function signUpHref(redirectTo = '/'): string {
  return `/register?redirectTo=${encodeURIComponent(redirectTo)}`;
}

export function stockLabel(stock: number, threshold = 5) {
  if (stock <= 0)
    return { label: 'Out of stock', tone: 'destructive' as const, purchasable: false };
  if (stock <= threshold)
    return { label: `Only ${stock} left`, tone: 'warning' as const, purchasable: true };
  return { label: `${stock} in stock`, tone: 'success' as const, purchasable: true };
}

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; className: string; dot: string; step: number }
> = {
  pending: {
    label: 'Pending',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    dot: 'bg-amber-500',
    step: 0,
  },
  processing: {
    label: 'Processing',
    className:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    dot: 'bg-blue-500',
    step: 1,
  },
  shipped: {
    label: 'Shipped',
    className:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30',
    dot: 'bg-violet-500',
    step: 2,
  },
  delivered: {
    label: 'Delivered',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    dot: 'bg-emerald-500',
    step: 3,
  },
  cancelled: {
    label: 'Cancelled',
    className:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
    dot: 'bg-rose-500',
    step: -1,
  },
};

export const ORDER_STATUS_FLOW: OrderStatus[] = [
  'pending',
  'processing',
  'shipped',
  'delivered',
];

/* -------------------------------------------------------------------------- */
/*  Roles (RBAC)                                                              */
/*  `public.is_staff()` / `public.is_admin()` in SQL decide what a role may do; */
/*  everything here is only the label, the colour and the copy the console     */
/*  renders for it.                                                            */
/* -------------------------------------------------------------------------- */

export const USER_ROLE_META: Record<
  UserRole,
  { label: string; short: string; description: string; className: string; dot: string }
> = {
  admin: {
    label: 'Administrator',
    short: 'Admin',
    description: 'Full access — orders, catalogue, users and roles.',
    className:
      'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
    dot: 'bg-indigo-500',
  },
  operator: {
    label: 'Operator',
    short: 'Operator',
    description: 'Runs orders, products and stock, and can add customer accounts. Cannot change roles.',
    className:
      'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
    dot: 'bg-sky-500',
  },
  customer: {
    label: 'Customer',
    short: 'Customer',
    description: 'Shops and places orders. Sees only their own account.',
    className:
      'bg-muted text-muted-foreground border-transparent dark:bg-white/10 dark:text-zinc-300',
    dot: 'bg-zinc-400',
  },
};

/** The three roles, ascending by privilege — the order the console offers them. */
export const ASSIGNABLE_ROLES: UserRole[] = ['customer', 'operator', 'admin'];

/** admin or operator — the TypeScript twin of `public.is_staff()`. */
export function isStaffRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'operator';
}

/** Safe lookup for values that may arrive as plain text from Postgres. */
export function userRoleMeta(role: string | null | undefined) {
  return USER_ROLE_META[(role ?? 'customer') as UserRole] ?? USER_ROLE_META.customer;
}

/**
 * The role an actor may assign when creating an account — one source of truth
 * for the API route (which enforces it) and the dialog (which only offers what
 * will be accepted).
 *
 * An operator may add **customers**: useful for onboarding someone over the
 * phone. They may not add staff, and that is deliberate — creating an account
 * means choosing its password, so an operator who could create an `admin` could
 * simply sign in as the admin they just made. That would quietly undo "only an
 * administrator changes roles", which is the rule the whole module rests on.
 *
 * Returns `null` when the request must be refused: no permission at all, or a
 * role the actor is not allowed to hand out. With no role requested, the least
 * powerful one is assumed.
 */
export function creatableRole(
  actorRole: string | null | undefined,
  requested?: string | null,
): UserRole | null {
  const allowed: UserRole[] =
    actorRole === 'admin' ? ['operator', 'admin'] : actorRole === 'operator' ? ['customer'] : [];

  const fallback = allowed[0];
  if (!fallback) return null;
  if (!requested) return fallback;
  return allowed.includes(requested as UserRole) ? (requested as UserRole) : null;
}

/* -------------------------------------------------------------------------- */
/*  Shop contact details (the footer and the order e-mails read from here)     */
/* -------------------------------------------------------------------------- */

export const SUPPORT_EMAIL = 'support@nexuscommerce.dev';
export const SUPPORT_PHONE = '01934100750';
export const SHOP_ADDRESS = 'Hemayetpur, Savar, Dhaka';

/* -------------------------------------------------------------------------- */
/*  Payments (Cash on Delivery vs manual bKash transfer)                      */
/* -------------------------------------------------------------------------- */

/** The shop's bKash "Send Money" wallet. Override with NEXT_PUBLIC_BKASH_NUMBER. */
export const BKASH_NUMBER = process.env.NEXT_PUBLIC_BKASH_NUMBER ?? '01789138295';

export const BKASH_INSTRUCTIONS =
  'Please Send Money to this bKash number, then paste your Transaction ID (TrxID) below to place your order.';

export const PAYMENT_METHOD_META: Record<
  PaymentMethod,
  { label: string; short: string; description: string }
> = {
  cod: {
    label: 'Cash on delivery',
    short: 'COD',
    description: 'Pay the courier when your parcel arrives. No card required.',
  },
  bkash: {
    label: 'bKash (Send Money)',
    short: 'bKash',
    description: 'Send the exact total, then paste your Transaction ID for verification.',
  },
  online: {
    label: 'Pay online (card / wallet)',
    short: 'Online',
    description: 'Stripe / Paystack placeholder — orders are queued as unpaid.',
  },
};

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  unpaid: {
    label: 'Unpaid',
    className:
      'bg-muted text-muted-foreground border-transparent dark:bg-white/10 dark:text-zinc-300',
  },
  pending_verification: {
    label: 'Awaiting review',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  },
  paid: {
    label: 'Paid',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  },
  refunded: {
    label: 'Refunded',
    className:
      'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  },
};

/** Safe lookup for values that may arrive as plain text from Postgres. */
export function paymentStatusMeta(status: string | null | undefined) {
  return PAYMENT_STATUS_META[(status ?? 'unpaid') as PaymentStatus] ?? PAYMENT_STATUS_META.unpaid;
}

/** Turns a Supabase / Postgres error into something a shop owner can read. */
export function humanizeError(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : (error as { message?: string })?.message ?? 'Something went wrong. Please try again.';

  if (/INSUFFICIENT_STOCK/i.test(raw)) return raw.replace(/^.*INSUFFICIENT_STOCK:\s*/i, 'Not enough stock — ') ;
  if (/PRODUCT_NOT_FOUND/i.test(raw)) return 'One of the products is no longer available.';
  if (/PRODUCT_UNAVAILABLE/i.test(raw))
    return raw.replace(/^.*PRODUCT_UNAVAILABLE:\s*/i, 'Unavailable — ');
  if (/EMPTY_CART/i.test(raw)) return 'Your cart is empty.';
  if (/TRXID_REQUIRED/i.test(raw)) return 'Enter the bKash Transaction ID to continue.';
  if (/TRXID_INVALID/i.test(raw)) return 'That Transaction ID does not look valid.';
  if (/UNSUPPORTED_PAYMENT_METHOD/i.test(raw)) return 'Choose a supported payment method.';
  if (/PHONE_REQUIRED/i.test(raw)) return 'A phone number is required for delivery.';
  if (/ADDRESS_REQUIRED/i.test(raw)) return 'A delivery address is required.';
  if (/INVALID_DELIVERY_AREA/i.test(raw)) return 'Choose a delivery area (Inside or Outside Dhaka).';
  if (/AUTH_REQUIRED/i.test(raw)) return 'Please sign in to place your order.';
  if (/PROFILE_REQUIRED/i.test(raw))
    return 'Your account is still being set up — refresh the page and try again.';
  if (/PROFILE_UPDATE_FORBIDDEN/i.test(raw))
    return 'Your profile could not be saved — refresh the page and try again.';
  if (/ORDER_NOT_CANCELLABLE/i.test(raw))
    return 'This order has already been processed and can no longer be cancelled. Contact support.';
  if (/ORDER_UPDATE_FORBIDDEN|ORDER_STATUS_FORBIDDEN/i.test(raw))
    return 'You are not allowed to change this order.';
  if (/ROLE_CHANGE_FORBIDDEN/i.test(raw)) return 'Only an administrator can change roles.';
  if (/ACCOUNT_STATE_FORBIDDEN/i.test(raw))
    return 'Only an administrator can block or unblock an account.';
  if (/CANNOT_CHANGE_OWN_ROLE/i.test(raw))
    return 'You cannot change your own role — ask another administrator.';
  if (/CANNOT_BLOCK_SELF/i.test(raw)) return 'You cannot block your own account.';
  if (/CANNOT_DELETE_SELF/i.test(raw)) return 'You cannot delete your own account.';
  if (/LAST_ADMIN/i.test(raw))
    return 'This is the last active administrator — promote someone else first.';
  if (/USER_NOT_FOUND/i.test(raw)) return 'That account no longer exists.';
  if (/AUTH_DELETE_FORBIDDEN/i.test(raw))
    return raw.replace(/^.*AUTH_DELETE_FORBIDDEN:\s*/i, '');
  if (/permission denied for table users/i.test(raw))
    return 'The database would not remove the auth account — run migrations 0008/0009, or set SUPABASE_SERVICE_ROLE_KEY.';
  if (/ACCOUNT_DISABLED/i.test(raw))
    return 'This account has been blocked. Please contact support.';
  if (/STAFF_CANNOT_ORDER/i.test(raw))
    return 'Staff and operator accounts cannot place orders — switch to a customer account.';
  if (/ROLE_NOT_ALLOWED/i.test(raw))
    return 'Only an administrator can create operator or administrator accounts.';
  if (/NOT_AUTHORIZED/i.test(raw)) return 'You are not authorised to do that.';
  if (/Invalid login credentials/i.test(raw)) return 'Incorrect email or password.';
  if (/duplicate key value/i.test(raw)) return 'That record already exists.';
  if (/violates row-level security/i.test(raw))
    return 'Permission denied — you do not have access to this resource.';
  return raw;
}
