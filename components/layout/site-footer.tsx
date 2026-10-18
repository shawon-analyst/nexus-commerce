import Link from 'next/link';
import { Mail, MapPin, Phone, ShieldCheck, Truck, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import type { Category } from '@/lib/types';
import { SHOP_ADDRESS, SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/utils';

export function SiteFooter({ categories }: { categories: Category[] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 border-t bg-muted/30">
      <div className="container-tight grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Link href="/" prefetch className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShoppingBag className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold">NexusCommerce</span>
          </Link>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Premium electronics, audio and everyday gear — with real-time stock and live order
            tracking.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Shop</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/products" prefetch className="transition-colors hover:text-foreground">
                All products
              </Link>
            </li>
            {categories.slice(0, 4).map((category) => (
              <li key={category.id}>
                <Link
                  href={`/products?category=${category.slug}`}
                  prefetch
                  className="transition-colors hover:text-foreground"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Account</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/orders" prefetch className="transition-colors hover:text-foreground">
                Track an order
              </Link>
            </li>
            <li>
              <Link href="/account" prefetch className="transition-colors hover:text-foreground">
                My profile
              </Link>
            </li>
            <li>
              <Link href="/cart" prefetch className="transition-colors hover:text-foreground">
                Your cart
              </Link>
            </li>
            <li>
              <Link href="/login" prefetch className="transition-colors hover:text-foreground">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/register" prefetch className="transition-colors hover:text-foreground">
                Create account
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Get in touch</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <Mail className="h-4 w-4" /> {SUPPORT_EMAIL}
            </li>
            <li className="flex items-center gap-2">
              <Phone className="h-4 w-4" /> {SUPPORT_PHONE}
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {SHOP_ADDRESS}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t">
        <div className="container-tight flex flex-col items-center justify-between gap-3 py-5 text-xs text-muted-foreground sm:flex-row">
          <p>© {year} Nexus Commerce. All rights reserved.</p>
          <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <li className="flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Fast delivery
            </li>
            <li className="flex items-center gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> 30-day returns
            </li>
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Secure checkout
            </li>
            <li className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> bKash &amp; cash on delivery
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
