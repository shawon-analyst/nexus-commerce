'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShoppingBag,
  UserRound,
  X,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { CartButton } from '@/components/storefront/cart-sheet';
import { CategoryPill } from '@/components/storefront/category-pill';
import { categoryIcon } from '@/lib/category-icons';
import { SearchBar } from '@/components/storefront/search-bar';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/components/providers/auth-provider';
import { accountDetail, displayEmail } from '@/lib/identity';
import { cn } from '@/lib/utils';
import type { Category } from '@/lib/types';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/products', label: 'Shop' },
  { href: '/orders', label: 'Orders' },
];

export function SiteHeader({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile, isStaff, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // The strip only marks a category active while the shopper is on /products.
  const activeCategory =
    pathname === '/products' ? (searchParams.get('category') ?? 'all') : '';

  // Which console badge to wear: an operator is staff but is not an
  // administrator, and saying "Admin" for them would be a lie.
  const staffLabel = !isStaff ? null : profile?.role === 'admin' ? 'Admin' : 'Operator';

  /*
   * The address shown under the account name. `profile.email` is the generated
   * `…@phone.…` alias for a mobile-number account, which the shopper must never
   * see, so it goes through the same masking as every other surface and falls
   * back to the number they actually recognise.
   */
  const accountIdentity = accountDetail({
    email: profile?.email ?? user?.email,
    phone: profile?.phone,
  });

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <AnnouncementBar />

      <div className="container-tight flex h-16 items-center gap-4">
        <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
          <DialogPrimitive.Trigger asChild>
            <button
              type="button"
              className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-accent lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
          </DialogPrimitive.Trigger>

          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="fixed inset-y-0 left-0 z-50 flex h-full w-full max-w-[320px] flex-col overflow-y-auto overscroll-contain border-r bg-background px-4 py-5 shadow-xl duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
            >
              <div className="flex items-center justify-between gap-2">
                <DialogPrimitive.Title className="truncate text-lg font-bold">
                  Nexus<span className="text-muted-foreground">Commerce</span>
                </DialogPrimitive.Title>
                <DialogPrimitive.Close className="-mr-1 shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </div>

              <SearchBar className="mt-5" />

              <nav className="mt-6 flex flex-col gap-0.5">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch
                    className={cn(
                      'flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent',
                      pathname === link.href && 'bg-accent',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {categories.length > 0 && (
                <>
                  <p className="mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Categories
                  </p>
                  <nav className="mt-2 flex flex-col gap-1">
                    {categories.map((category) => {
                      const Icon = categoryIcon(category.slug, category.name);
                      return (
                        <Link
                          key={category.id}
                          href={`/products?category=${category.slug}`}
                          prefetch
                          className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{category.name}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </>
              )}

              <div className="mt-auto grid gap-2 border-t pt-4">
                {user && (
                  <Link
                    href="/account"
                    prefetch
                    className="mb-1 flex min-w-0 items-center gap-3 overflow-hidden rounded-xl border bg-card/60 p-2.5 transition-colors hover:bg-accent"
                  >
                    <UserAvatar
                      src={profile?.avatar_url}
                      name={profile?.full_name}
                      email={displayEmail(profile?.email ?? user?.email) ?? profile?.phone}
                      className="h-10 w-10 shrink-0 text-xs"
                      sizes="40px"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {profile?.full_name ?? 'Account'}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {accountIdentity}
                      </span>
                    </span>
                    <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                )}

                <div className="mb-1 flex items-center justify-between gap-2 rounded-md border px-3 py-1.5">
                  <span className="text-sm font-medium">Appearance</span>
                  <ThemeToggle />
                </div>
                {user ? (
                  <>
                    <Button asChild variant="outline" className="h-11 justify-start px-3">
                      <Link href="/account" prefetch>
                        <UserRound className="h-4 w-4" /> My profile
                      </Link>
                    </Button>
                    {isStaff && (
                      <Button asChild variant="outline" className="h-11 justify-start px-3">
                        <Link href="/admin">
                          <LayoutDashboard className="h-4 w-4" /> Admin panel
                        </Link>
                      </Button>
                    )}
                    <Button asChild className="h-11 justify-start px-3">
                      <Link href="/orders">
                        <Package className="h-4 w-4" /> My orders
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-11 justify-start px-3 text-muted-foreground hover:text-destructive"
                      onClick={() => void signOut()}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button asChild className="h-11">
                      <Link href="/login">Sign in</Link>
                    </Button>
                    <Button asChild variant="outline" className="h-11">
                      <Link href="/register">Create account</Link>
                    </Button>
                  </>
                )}
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <Link href="/" prefetch className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShoppingBag className="h-4 w-4" />
          </span>
          <span className="hidden text-lg font-bold tracking-tight sm:block">
            Nexus<span className="text-muted-foreground">Commerce</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              prefetch
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                pathname === link.href && 'text-foreground',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <SearchBar className="mx-auto hidden max-w-md flex-1 md:block" />

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <CartButton />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-offset-background transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Account menu"
                >
                  <UserAvatar
                    src={profile?.avatar_url}
                    name={profile?.full_name}
                    email={profile?.email ?? user.email}
                    sizes="36px"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="p-0 font-normal">
                  <Link
                    href="/account"
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
                  >
                    <UserAvatar
                      src={profile?.avatar_url}
                      name={profile?.full_name}
                      email={displayEmail(profile?.email ?? user?.email) ?? profile?.phone}
                      className="h-10 w-10 text-xs"
                      sizes="40px"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {profile?.full_name ?? 'Account'}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {accountIdentity}
                      </span>
                    </span>
                    {staffLabel && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground">
                        {staffLabel}
                      </span>
                    )}
                  </Link>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account">
                    <UserRound className="h-4 w-4" /> My profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/orders">
                    <Package className="h-4 w-4" /> My orders
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/products">
                    <ShoppingBag className="h-4 w-4" /> Continue shopping
                  </Link>
                </DropdownMenuItem>
                {isStaff && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/admin" className="font-medium">
                        <LayoutDashboard className="h-4 w-4" /> Admin panel
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void signOut();
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">
                  <UserRound className="h-4 w-4" /> Sign in
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* category strip */}
      {categories.length > 0 && (
        <div className="hidden border-t lg:block">
          <div className="container-tight no-scrollbar flex items-center gap-1.5 overflow-x-auto py-2">
            <CategoryPill
              name="All Products"
              slug="all"
              href="/products"
              active={activeCategory === 'all'}
            />
            {categories.map((category) => (
              <CategoryPill
                key={category.id}
                name={category.name}
                slug={category.slug}
                href={`/products?category=${category.slug}`}
                active={activeCategory === category.slug}
              />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
