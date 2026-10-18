'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarDays,
  LayoutDashboard,
  MapPin,
  Mail,
  Package,
  PencilLine,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusBadge } from '@/components/ui/status-badge';
import { AvatarUploader } from '@/components/account/avatar-uploader';
import { EditProfileDialog } from '@/components/account/edit-profile-dialog';
import { useAuth } from '@/components/providers/auth-provider';
import { formatCurrency, formatDate, toNumber } from '@/lib/utils';
import type { OrderWithItems, Profile } from '@/lib/types';

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="block truncate text-lg font-bold tracking-tight">{value}</span>
          {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
        </span>
      </CardContent>
    </Card>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  fallback,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null;
  fallback: string;
}) {
  const filled = Boolean(value?.trim());
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={filled ? 'text-sm font-medium' : 'text-sm italic text-muted-foreground'}>
          {filled ? value : fallback}
        </p>
      </div>
    </div>
  );
}

export function ProfileDashboard({
  initialProfile,
  orders,
}: {
  initialProfile: Profile;
  orders: OrderWithItems[];
}) {
  const router = useRouter();
  const { refreshProfile, isStaff } = useAuth();
  const [profile, setProfile] = React.useState(initialProfile);

  /**
   * Every write in this page funnels through here: the local card updates
   * instantly, the header avatar follows via `refreshProfile()`, and
   * `router.refresh()` re-runs the server components so the checkout prefill and
   * the order list stay consistent.
   */
  const handleUpdated = React.useCallback(
    (next: Profile) => {
      setProfile(next);
      void refreshProfile();
      router.refresh();
    },
    [refreshProfile, router],
  );

  const stats = React.useMemo(() => {
    const counted = orders.filter((order) => order.status !== 'cancelled');
    return {
      orders: orders.length,
      spend: counted.reduce((sum, order) => sum + toNumber(order.total_amount), 0),
      active: orders.filter((order) => ['pending', 'processing', 'shipped'].includes(order.status))
        .length,
    };
  }, [orders]);

  const recentOrders = orders.slice(0, 3);
  const displayName = profile.full_name?.trim() || profile.email;

  return (
    <div className="space-y-8">
      {/* ---------------------------------------------------------------- *
       *  Stats                                                            *
       * ---------------------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Package} label="Orders placed" value={String(stats.orders)} />
        <StatTile
          icon={Wallet}
          label="Lifetime spend"
          value={formatCurrency(stats.spend)}
          hint="Cancelled orders excluded"
        />
        <StatTile
          icon={Sparkles}
          label="In progress"
          value={String(stats.active)}
          hint={stats.active === 1 ? 'order on the way' : 'orders on the way'}
        />
        <StatTile
          icon={CalendarDays}
          label="Member since"
          value={formatDate(profile.created_at)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        {/* -------------------------------------------------------------- *
         *  Identity + avatar                                              *
         * -------------------------------------------------------------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserRound className="h-4 w-4" /> Your photo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AvatarUploader profile={profile} onUpdated={handleUpdated} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick links</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild variant="outline" className="justify-start">
                <Link href="/orders">
                  <Package className="h-4 w-4" /> My orders
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/products">
                  <ShoppingBag className="h-4 w-4" /> Continue shopping
                </Link>
              </Button>
              {isStaff && (
                <Button asChild variant="outline" className="justify-start">
                  <Link href="/admin">
                    <LayoutDashboard className="h-4 w-4" /> Admin panel
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* -------------------------------------------------------------- *
         *  Personal details                                              *
         * -------------------------------------------------------------- */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-base">Personal details</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  These details prefill checkout — keep them current.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {profile.role === 'admin' ? (
                  <Badge variant="default">Admin</Badge>
                ) : profile.role === 'operator' ? (
                  <Badge variant="secondary">Operator</Badge>
                ) : null}
                <EditProfileDialog
                  profile={profile}
                  onUpdated={handleUpdated}
                  trigger={
                    <Button variant="outline" size="sm">
                      <PencilLine className="h-3.5 w-3.5" /> Edit profile
                    </Button>
                  }
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                <DetailRow
                  icon={UserRound}
                  label="Full name"
                  value={profile.full_name}
                  fallback="Not set yet"
                />
                <DetailRow icon={Mail} label="Email" value={profile.email} fallback="Not set yet" />
                <DetailRow
                  icon={Phone}
                  label="Phone number"
                  value={profile.phone}
                  fallback="Add a number so we can reach you about deliveries"
                />
                <DetailRow
                  icon={MapPin}
                  label="Delivery address"
                  value={profile.shipping_address}
                  fallback="Add a default address to speed up checkout"
                />
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------------ *
           *  Recent orders                                                *
           * ------------------------------------------------------------ */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Recent orders</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/orders">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentOrders.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-8 text-center">
                  <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nothing here yet — your first order will show up instantly.
                  </p>
                  <Button asChild size="sm">
                    <Link href="/products">Start shopping</Link>
                  </Button>
                </div>
              ) : (
                <ul className="divide-y">
                  {recentOrders.map((order) => (
                    <li key={order.id}>
                      <Link
                        href="/orders"
                        className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-accent"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-mono text-xs font-semibold uppercase tracking-wide">
                            #{order.id.slice(0, 8)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDate(order.created_at)} ·{' '}
                            {order.order_items.length}{' '}
                            {order.order_items.length === 1 ? 'item' : 'items'}
                          </span>
                        </span>
                        <span className="text-sm font-semibold">
                          {formatCurrency(order.total_amount)}
                        </span>
                        <OrderStatusBadge status={order.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{displayName}</span>. Your
                photo and details are stored on your own profile row and only ever written by you —
                nobody else can change them.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
