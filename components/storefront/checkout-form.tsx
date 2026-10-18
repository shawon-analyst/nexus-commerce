'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Check,
  Copy,
  CreditCard,
  Lock,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  User,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/ui/safe-image';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cartItemsCount, cartTotals, useCartStore } from '@/store/cart-store';
import {
  BKASH_INSTRUCTIONS,
  BKASH_NUMBER,
  DELIVERY_AREAS,
  DELIVERY_AREA_META,
  PAYMENT_METHOD_META,
  cn,
  formatCurrency,
  humanizeError,
  signInHref,
  signUpHref,
} from '@/lib/utils';
import type { DeliveryArea, PaymentMethod } from '@/lib/types';

export function CheckoutForm({
  defaultName = '',
  defaultPhone = '',
  defaultAddress = '',
  isAuthenticated = false,
}: {
  defaultName?: string;
  defaultPhone?: string;
  defaultAddress?: string;
  isAuthenticated?: boolean;
}) {
  const router = useRouter();
  const lines = useCartStore((s) => s.lines);
  const clearCart = useCartStore((s) => s.clear);
  const hydrated = useCartStore((s) => s.hydrated);
  const deliveryArea = useCartStore((s) => s.deliveryArea);
  const setDeliveryArea = useCartStore((s) => s.setDeliveryArea);

  const [customerName, setCustomerName] = React.useState(defaultName);
  const [phone, setPhone] = React.useState(defaultPhone);
  const [address, setAddress] = React.useState(defaultAddress);
  const [notes, setNotes] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('cod');
  const [transactionId, setTransactionId] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  // Re-quoted on every delivery-area change: the summary is the live contract
  // the order will be created with.
  const { subtotal, delivery, total } = React.useMemo(
    () => cartTotals(lines, deliveryArea),
    [lines, deliveryArea],
  );
  const count = cartItemsCount(lines);
  const isBkash = paymentMethod === 'bkash';

  async function copyBkashNumber() {
    try {
      await navigator.clipboard.writeText(BKASH_NUMBER);
    } catch {
      // Clipboard access can be blocked (insecure origin / denied permission).
      window.prompt('Copy the bKash number below', BKASH_NUMBER);
      return;
    }
    setCopied(true);
    toast.success('bKash number copied', { description: BKASH_NUMBER });
    window.setTimeout(() => setCopied(false), 2000);
  }

  /**
   * Save what the shopper just typed onto their profile so the next checkout is
   * one click. Best-effort only: the order is already placed by this point, so a
   * failure here must stay silent.
   */
  async function rememberDetails(supabase: ReturnType<typeof getSupabaseBrowserClient>) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('profiles')
        .update({
          full_name: customerName.trim(),
          phone: phone.trim(),
          shipping_address: address.trim(),
        })
        .eq('id', user.id);
    } catch {
      // non-critical
    }
  }

  /** Sends a signed-out shopper to sign in and then straight back here. */
  function requireSignIn(description: string) {
    toast.error('Please sign in to place your order', { description });
    router.push(signInHref('/checkout'));
  }

  async function placeOrder(event: React.FormEvent) {
    event.preventDefault();

    // Checkout is account-only. The page refuses to render this form without a
    // profile, so this is a belt-and-braces guard for the open tab case.
    if (!isAuthenticated) {
      requireSignIn('Your cart is saved — sign in and pick up right where you left off.');
      return;
    }

    if (lines.length === 0) {
      toast.error('Your cart is empty');
      return;
    }
    if (!customerName.trim()) return toast.error('Please enter your full name');
    if (phone.trim().replace(/\D/g, '').length < 7)
      return toast.error('Please enter a valid phone number');
    if (address.trim().length < 10)
      return toast.error('Please enter a complete delivery address');
    if (isBkash && transactionId.trim().length < 4)
      return toast.error('bKash Transaction ID required', {
        description: 'Paste the TrxID from your bKash confirmation message.',
      });

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();

      // A session can expire while the form is open — verify before spending the
      // round trip, so the shopper gets a sign-in prompt instead of an error.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        requireSignIn('Your session expired. Sign in again to finish this order.');
        return;
      }

      // price + stock are resolved server-side inside the SQL function —
      // the browser never dictates what gets charged.
      const { data: orderId, error } = await supabase.rpc('place_order', {
        p_customer_name: customerName.trim(),
        p_phone: phone.trim(),
        p_shipping_address: address.trim(),
        p_payment_method: paymentMethod,
        p_items: lines.map((line) => ({
          product_id: line.productId,
          quantity: line.quantity,
        })),
        // bKash: the shopper's "Send Money" proof. Anything else: null.
        // Notes travel with the insert, so nothing has to UPDATE the order
        // afterwards (which the tamper guard would reject anyway).
        p_transaction_id: isBkash ? transactionId.trim() : null,
        p_notes: notes.trim() || null,
        // Drives the delivery charge the database writes (৳60 inside / ৳120
        // outside). Validated in SQL, so a tampered value is refused there.
        p_delivery_area: deliveryArea,
      });

      if (error) {
        // The database is the final authority on "who may order".
        if (/AUTH_REQUIRED|PROFILE_REQUIRED/i.test(error.message)) {
          requireSignIn('Sign in again to finish this order — your cart is untouched.');
          return;
        }
        toast.error('Could not place your order', { description: humanizeError(error) });
        return;
      }

      clearCart();
      if (isAuthenticated) void rememberDetails(supabase);
      toast.success('Order placed!', {
        description: isBkash
          ? 'Your bKash transfer is queued for verification.'
          : 'Your items are reserved.',
      });

      // Best-effort confirmation e-mail. Deliberately not awaited: the order is
      // already committed, and the route re-checks ownership through RLS before
      // it mails anything. A missing mail provider is a no-op, not an error.
      void fetch(`/api/orders/${orderId}/notify`, {
        method: 'POST',
        keepalive: true,
      }).catch(() => {});

      // The order belongs to the signed-in shopper, so it is readable through
      // RLS — the confirmation link carries no personal data.
      router.push(`/orders/${orderId}?placed=1`);
    } finally {
      setLoading(false);
    }
  }

  if (hydrated && lines.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="mt-5 text-xl font-bold">Nothing to check out</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add a few products to your cart and come back.
        </p>
        <Button asChild className="mt-6">
          <Link href="/products">Browse products</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={placeOrder} className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      {/* ------------------------------------------------------ details ------ */}
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" /> Delivery details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="customer-name">
                  <User className="mr-1 inline h-3.5 w-3.5" /> Full name
                </Label>
                <Input
                  id="customer-name"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Jane Doe"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="phone">
                  <Phone className="mr-1 inline h-3.5 w-3.5" /> Phone number
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="01712 345678"
                  autoComplete="tel"
                  inputMode="tel"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  The courier calls this number on delivery day.
                </p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="address">Delivery address</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder={'House / flat number, street\nArea, thana, district\nBangladesh'}
                autoComplete="street-address"
                required
              />
            </div>

            {/* ---- delivery area drives the charge ---------------------- */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5">
                <Truck className="h-3.5 w-3.5" /> Delivery area
              </Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {DELIVERY_AREAS.map((area) => {
                  const meta = DELIVERY_AREA_META[area];
                  const active = deliveryArea === area;
                  return (
                    <label
                      key={area}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all duration-200 ease-in-out',
                        active
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'hover:border-primary/40 hover:bg-accent/50',
                      )}
                    >
                      <input
                        type="radio"
                        name="delivery-area"
                        value={area}
                        checked={active}
                        onChange={() => setDeliveryArea(area as DeliveryArea)}
                        className="mt-1 h-4 w-4 accent-primary"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">
                            {meta.label}{' '}
                            <span className="font-normal text-muted-foreground">
                              ({meta.labelBn})
                            </span>
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatCurrency(meta.fee)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {meta.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="notes">Delivery notes (optional)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Gate code, landmark, preferred time…"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" /> Payment method
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {/* ---- Cash on delivery (default: no extra fields) ------------- */}
            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                paymentMethod === 'cod'
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'hover:bg-accent/50',
              )}
            >
              <input
                type="radio"
                name="payment"
                value="cod"
                checked={paymentMethod === 'cod'}
                onChange={() => setPaymentMethod('cod')}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <Banknote className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <span>
                <span className="block text-sm font-semibold">{PAYMENT_METHOD_META.cod.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {PAYMENT_METHOD_META.cod.description}
                </span>
              </span>
            </label>

            {/* ---- bKash "Send Money" + TrxID ----------------------------- */}
            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                isBkash
                  ? 'border-rose-400 bg-rose-50/60 ring-1 ring-rose-400 dark:border-rose-500/50 dark:bg-rose-500/10'
                  : 'hover:bg-accent/50',
              )}
            >
              <input
                type="radio"
                name="payment"
                value="bkash"
                checked={isBkash}
                onChange={() => setPaymentMethod('bkash')}
                className="mt-1 h-4 w-4 accent-rose-500"
              />
              <Wallet className="mt-0.5 h-5 w-5 text-rose-500" />
              <span className="flex-1">
                <span className="block text-sm font-semibold">{PAYMENT_METHOD_META.bkash.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {PAYMENT_METHOD_META.bkash.description}
                </span>
              </span>
            </label>

            {isBkash && (
              <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-500/30 dark:bg-rose-500/10">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                  Send Money to this bKash number
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xl font-bold tracking-wider text-rose-700 dark:text-rose-200">
                    {BKASH_NUMBER}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={copyBkashNumber}
                    className="h-8 gap-1.5 border-rose-300 bg-background px-2.5 text-xs dark:border-rose-500/40"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy Number'}
                  </Button>
                </div>

                <p className="mt-3 text-sm font-semibold text-rose-700 dark:text-rose-200">
                  Amount to send: {formatCurrency(total)}
                </p>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {BKASH_INSTRUCTIONS}
                </p>

                <div className="mt-4 grid gap-1.5">
                  <Label htmlFor="transaction-id">
                    bKash Transaction ID (TrxID){' '}
                    <span aria-hidden className="text-destructive">
                      *
                    </span>
                  </Label>
                  <Input
                    id="transaction-id"
                    value={transactionId}
                    onChange={(event) => setTransactionId(event.target.value)}
                    placeholder="e.g. 9F7A2K4L1M"
                    autoComplete="off"
                    spellCheck={false}
                    required={isBkash}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    An administrator verifies the transfer before your order ships.
                  </p>
                </div>
              </div>
            )}

            {/* ---- Online (provider placeholder) -------------------------- */}
            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border border-dashed p-4',
                paymentMethod === 'online'
                  ? 'border-primary bg-primary/5 opacity-100'
                  : 'opacity-70 hover:bg-accent/50 hover:opacity-100',
              )}
            >
              <input
                type="radio"
                name="payment"
                value="online"
                checked={paymentMethod === 'online'}
                onChange={() => setPaymentMethod('online')}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <CreditCard className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <span>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {PAYMENT_METHOD_META.online.label}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Coming soon
                  </span>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Stripe / Paystack placeholder — plug in your provider to enable. Orders placed
                  with this option are queued as <em>unpaid</em> for manual settlement.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------ summary ------- */}
      <div className="lg:sticky lg:top-28 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Order summary{' '}
              <span className="text-sm font-normal text-muted-foreground">({count} items)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hydrated ? (
              <div className="space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="flex gap-3">
                    <div className="h-14 w-14 animate-pulse rounded-lg bg-muted" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="thin-scrollbar max-h-72 space-y-3 overflow-y-auto pr-1">
                {lines.map((line) => (
                  <li key={line.productId} className="flex items-center gap-3">
                    <SafeImage
                      src={line.imageUrl}
                      alt={line.title}
                      wrapperClassName="h-14 w-14 shrink-0 rounded-lg border"
                      sizes="56px"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium">{line.title}</p>
                      <p className="text-xs text-muted-foreground">Qty {line.quantity}</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">
                      {formatCurrency(line.price * line.quantity)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <Separator className="my-4" />

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatCurrency(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Delivery
                  <span className="ml-1 text-[11px] text-muted-foreground/70">
                    ({DELIVERY_AREA_META[deliveryArea].short})
                  </span>
                </dt>
                <dd className="tabular-nums">{formatCurrency(delivery)}</dd>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCurrency(total)}</dd>
              </div>
              <p className="text-xs text-muted-foreground">
                Amounts are recalculated from live catalogue prices when the order is created.
              </p>
            </dl>

            {isBkash && (
              <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                Send <strong>{formatCurrency(total)}</strong> to <strong>{BKASH_NUMBER}</strong> and
                paste the TrxID above. The order stays{' '}
                <strong>awaiting verification</strong> until an administrator confirms the transfer.
              </p>
            )}

            <Button type="submit" size="lg" className="mt-5 w-full" loading={loading}>
              <Lock className="h-4 w-4" />
              {loading
                ? 'Placing order…'
                : isAuthenticated
                  ? `Place order · ${formatCurrency(total)}`
                  : 'Sign in to place your order'}
            </Button>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Stock is reserved atomically — no double selling.
            </p>

            {isAuthenticated ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Signed in — this order is saved to your account.{' '}
                <Link href="/orders" className="font-medium underline underline-offset-2">
                  View my orders
                </Link>
              </p>
            ) : (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Checkout requires an account.{' '}
                <Link href={signInHref('/checkout')} className="font-medium underline underline-offset-2">
                  Sign in
                </Link>{' '}
                or{' '}
                <Link
                  href={signUpHref('/checkout')}
                  className="font-medium underline underline-offset-2"
                >
                  create one
                </Link>{' '}
                to finish — your cart is saved.
              </p>
            )}

            <Button asChild variant="ghost" className="mt-2 w-full">
              <Link href="/cart">
                <ArrowLeft className="h-4 w-4" /> Back to cart
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
