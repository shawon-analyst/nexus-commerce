import Link from 'next/link';
import { ArrowLeft, Lock, PackageCheck, ShieldCheck, ShoppingBag, Truck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { signInHref, signUpHref } from '@/lib/utils';

const CHECKOUT_PATH = '/checkout';

/**
 * The prompt a signed-out shopper sees instead of the checkout form.
 *
 * This is the second of three layers (middleware → page → RPC): even if a
 * request slips past the middleware gate with a stale session cookie, the page
 * refuses to render the form and asks for a sign-in, returning the shopper to
 * `/checkout` afterwards. Their cart is in localStorage, so nothing is lost.
 *
 * `error` covers "a session cookie exists but the auth server rejected it" —
 * the overwhelmingly common case being an expired session, so it still leads
 * with *Sign in to check out* and only adds a short diagnostic line.
 */
export function CheckoutGate({ reason = 'anonymous' }: { reason?: 'anonymous' | 'error' }) {
  const isError = reason === 'error';

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <Lock className="h-7 w-7" />
      </div>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">Sign in to check out</h1>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {isError ? (
          <>
            Your session has expired or could not be verified. Sign in again and you will land right
            back here — nothing in your cart is lost.
          </>
        ) : (
          <>
            Orders are tied to your account so you can track them, cancel a pending one and keep
            your delivery details on file. Your cart is saved — you will come straight back here.
          </>
        )}
      </p>

      <div className="mt-7 grid w-full gap-2.5 sm:grid-cols-2">
        <Button asChild size="lg" className="w-full">
          <Link href={signInHref(CHECKOUT_PATH)}>Sign in</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href={signUpHref(CHECKOUT_PATH)}>
            <UserPlus className="h-4 w-4" /> Create account
          </Link>
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Google and Facebook sign-in work too — no password to remember.
      </p>

      {isError && (
        <p className="mt-2 text-xs text-muted-foreground">
          If signing in also fails, the authentication server may be briefly unreachable — try again
          in a moment.
        </p>
      )}

      <Card className="mt-8 w-full text-left">
        <CardContent className="grid gap-3 p-5 text-sm">
          {[
            { icon: PackageCheck, text: 'Every order lands in your account with a live status.' },
            { icon: Truck, text: 'Your name, phone and address prefill the next checkout.' },
            { icon: ShieldCheck, text: 'Stock is reserved the instant the order is created.' },
          ].map(({ icon: Icon, text }) => (
            <p key={text} className="flex items-start gap-2.5 text-muted-foreground">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              {text}
            </p>
          ))}
        </CardContent>
      </Card>

      <Button asChild variant="ghost" className="mt-4">
        <Link href="/cart">
          <ArrowLeft className="h-4 w-4" /> Back to cart
        </Link>
      </Button>

      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShoppingBag className="h-3.5 w-3.5" /> Your items are still in the cart.
      </p>
    </div>
  );
}
