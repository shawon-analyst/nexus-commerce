'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  ShoppingBag,
  Tags,
  Users,
  X,
} from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { useAuth } from '@/components/providers/auth-provider';
import { cn, initials, isStaffRole, userRoleMeta } from '@/lib/utils';
import type { UserRole } from '@/lib/types';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/orders', label: 'Orders', icon: Boxes },
  { href: '/admin/products', label: 'Products', icon: ShoppingBag },
  { href: '/admin/categories', label: 'Categories', icon: Tags },
  // Staff, the whole thing: an operator opens the users list and adds customer
  // accounts from it. Role changes, blocking and deletion stay with an
  // administrator — enforced in SQL and hidden inside the page itself, never by
  // which links the sidebar happens to show.
  { href: '/admin/users', label: 'Users', icon: Users },
];

function NavLinks({
  role,
  onNavigate,
  pendingOrders = 0,
}: {
  role: UserRole;
  onNavigate?: () => void;
  pendingOrders?: number;
}) {
  const pathname = usePathname();
  // Mirrors `is_staff()`: admin or operator. A shopper reaching this component is
  // already a bug elsewhere — it still will not be handed a single link.
  const items = isStaffRole(role) ? NAV : [];

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
            {item.href === '/admin/orders' && pendingOrders > 0 && (
              <span
                className={cn(
                  'ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  active ? 'bg-primary-foreground/20' : 'bg-amber-100 text-amber-700',
                )}
              >
                {pendingOrders}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  children,
  role,
  fullName,
  email,
}: {
  children: React.ReactNode;
  role: UserRole;
  fullName: string | null;
  email: string;
}) {
  const pathname = usePathname();
  const { signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const roleMeta = userRoleMeta(role);
  /**
   * The console's one link back to the shop front. It points at the catalogue,
   * not at `/` — the middleware now sends staff from the storefront home straight
   * back here, so a `/` link would be a loop with extra steps. This keeps the
   * "edit a product, then look at it" trip working, and stays administrator-only
   * because an operator has no reason to be in the shop.
   */
  const showCatalogue = role === 'admin';

  React.useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <div className="min-h-screen bg-muted/30 lg:grid lg:grid-cols-[256px_1fr]">
      {/* ------------------------------------------------ desktop sidebar --- */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-background px-4 py-5 lg:flex">
        <Link href="/admin" className="flex items-center gap-2 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-bold leading-tight">Admin console</span>
            <span className="block text-[11px] text-muted-foreground">Nexus Commerce</span>
          </span>
        </Link>

        <div className="mt-7 flex-1">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Manage
          </p>
          <NavLinks role={role} />
        </div>

        <div className="space-y-1 border-t pt-4">
          {showCatalogue && (
            <Link
              href="/products"
              prefetch
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" /> Browse catalogue
            </Link>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* ------------------------------------------------ main column ------- */}
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:px-6">
          <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogPrimitive.Trigger asChild>
              <button
                type="button"
                className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent lg:hidden"
                aria-label="Open admin menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
              <DialogPrimitive.Content
                aria-describedby={undefined}
                className="fixed inset-y-0 left-0 z-50 flex h-full w-[82%] max-w-xs flex-col border-r bg-background p-5 shadow-xl data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
              >
                <div className="flex items-center justify-between">
                  <DialogPrimitive.Title className="flex items-center gap-2 text-sm font-bold">
                    <ShieldCheck className="h-4 w-4" /> Admin console
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Close className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogPrimitive.Close>
                </div>

                <div className="mt-6 flex-1">
                  <NavLinks role={role} onNavigate={() => setMobileOpen(false)} />
                </div>

                <div className="space-y-1 border-t pt-4">
                  {showCatalogue && (
                    <Link
                      href="/products"
                      prefetch
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent"
                    >
                      <ExternalLink className="h-4 w-4" /> Browse catalogue
                    </Link>
                  )}
                  <Button variant="ghost" className="w-full justify-start" onClick={() => void signOut()}>
                    <LogOut className="h-4 w-4" /> Sign out
                  </Button>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          <Link href="/admin" className="text-sm font-semibold lg:hidden">
            Nexus Admin
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <span className="hidden text-right sm:block">
              <span className="block text-xs font-medium leading-tight">
                {fullName ?? roleMeta.label}
              </span>
              <span className="block text-[11px] text-muted-foreground">{email}</span>
            </span>
            <span
              className={cn(
                'hidden rounded-full border px-2 py-0.5 text-[10px] font-semibold lg:inline-flex',
                roleMeta.className,
              )}
              title={roleMeta.description}
            >
              {roleMeta.short}
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initials(fullName, email)}
            </span>
          </div>
        </header>

        <div className="flex-1 p-4 lg:p-7">{children}</div>
      </div>
    </div>
  );
}
