'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Clock,
  DollarSign,
  PackageCheck,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SafeImage } from '@/components/ui/safe-image';
import { RealtimeDot } from '@/components/ui/status-badge';
import { StatCard } from '@/components/admin/stat-card';
import { OrderStatusSelect, PaymentBadge } from '@/components/admin/order-status-control';
import { useRealtimeOrders } from '@/hooks/use-realtime';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ORDER_STATUS_META, cn, formatCurrency, formatNumber, timeAgo, toNumber } from '@/lib/utils';
import type { DashboardStats, OrderWithItems } from '@/lib/types';

export function DashboardClient({
  initialStats,
  initialOrders,
}: {
  initialStats: DashboardStats;
  initialOrders: OrderWithItems[];
}) {
  const [stats, setStats] = React.useState(initialStats);
  const refreshTimer = React.useRef<number | null>(null);

  const refreshStats = React.useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(async () => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('admin_dashboard_stats');
      if (!error && data) setStats(data as unknown as DashboardStats);
    }, 600);
  }, []);

  const { orders, status, stats: live } = useRealtimeOrders(initialOrders, {
    channelName: 'admin-dashboard',
    onNewOrder: (order) => {
      toast.success('New order received 🎉', {
        description: `${order.customer_name} · ${formatCurrency(order.total_amount)}`,
        action: { label: 'View', onClick: () => window.location.assign('/admin/orders') },
        duration: 8000,
      });
      refreshStats();
    },
    onStatusChange: () => refreshStats(),
  });

  React.useEffect(
    () => () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    },
    [],
  );

  const maxRevenue = Math.max(...stats.revenue_by_day.map((d) => toNumber(d.revenue)), 1);

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------- header ----- */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything is automated — stock, totals and statuses update themselves.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RealtimeDot status={status} />
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/orders">
              <Boxes className="h-4 w-4" /> Manage orders
            </Link>
          </Button>
        </div>
      </header>

      {/* ------------------------------------------------------ stat cards -- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total revenue"
          value={formatCurrency(stats.total_revenue)}
          hint={`${formatCurrency(stats.revenue_30d)} in the last 30 days`}
          icon={DollarSign}
          tone="success"
        />
        <StatCard
          label="Total orders"
          value={formatNumber(stats.total_orders)}
          hint={`${formatNumber(stats.delivered_orders)} delivered · ${formatNumber(
            stats.cancelled_orders,
          )} cancelled`}
          icon={ShoppingBag}
          tone="info"
        />
        <StatCard
          label="Pending orders"
          value={formatNumber(live.pending)}
          hint="Waiting to be processed"
          icon={Clock}
          tone={live.pending > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Low stock alerts"
          value={formatNumber(stats.low_stock_count + stats.out_of_stock)}
          hint={`${formatNumber(stats.out_of_stock)} out of stock · ${formatNumber(
            stats.total_products,
          )} products`}
          icon={AlertTriangle}
          tone={stats.low_stock_count + stats.out_of_stock > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* --------------------------------------------------- chart ------- */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4" /> Revenue · last 7 days
            </CardTitle>
            <Badge variant="muted" className="font-normal">
              {formatCurrency(stats.revenue_by_day.reduce((s, d) => s + toNumber(d.revenue), 0))}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="flex h-48 items-end gap-2 sm:gap-3">
              {stats.revenue_by_day.map((day) => {
                const revenue = toNumber(day.revenue);
                const height = Math.max((revenue / maxRevenue) * 100, 3);
                return (
                  <div key={day.day} className="group flex flex-1 flex-col items-center gap-2">
                    <span className="text-[10px] font-medium tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {formatCurrency(revenue)}
                    </span>
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className={cn(
                          'w-full rounded-t-md transition-all',
                          revenue > 0 ? 'bg-primary/80 group-hover:bg-primary' : 'bg-muted',
                        )}
                        style={{ height: `${height}%` }}
                        title={`${day.day}: ${formatCurrency(revenue)} · ${day.orders} orders`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(day.day).toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------------------------- low stock list --- */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" /> Restock soon
            </CardTitle>
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/products">
                Manage <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.low_stock_products.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center">
                <PackageCheck className="h-6 w-6 text-emerald-500" />
                <p className="text-sm font-medium">Inventory looks healthy</p>
                <p className="text-xs text-muted-foreground">
                  No product is at or below its low-stock threshold.
                </p>
              </div>
            ) : (
              <ul className="thin-scrollbar max-h-56 space-y-3 overflow-y-auto pr-1">
                {stats.low_stock_products.map((product) => (
                  <li key={product.id} className="flex items-center gap-3">
                    <SafeImage
                      src={product.image_url}
                      alt={product.title}
                      wrapperClassName="h-10 w-10 shrink-0 rounded-md border"
                      sizes="40px"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-medium">{product.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Threshold {product.threshold}
                      </p>
                    </div>
                    <Badge
                      variant={product.stock === 0 ? 'destructive' : 'warning'}
                      className="shrink-0"
                    >
                      {product.stock === 0 ? 'Out' : `${product.stock} left`}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------------- recent --- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Live order feed
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {formatNumber(stats.total_customers)} customers
              <Users className="ml-1.5 inline h-3.5 w-3.5" />
            </span>
            <Button asChild size="sm" variant="ghost">
              <Link href="/admin/orders">
                All orders <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <ShoppingBag className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">No orders yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                New orders appear here automatically the second a customer checks out.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {orders.slice(0, 6).map((order) => (
                <li
                  key={order.id}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {order.customer_name || 'Guest'}
                      </p>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {timeAgo(order.created_at)} · {order.order_items?.length ?? 0} item(s) ·{' '}
                      {order.phone}
                    </p>
                  </div>

                  <PaymentBadge method={order.payment_method} status={order.payment_status} />

                  <p className="text-sm font-semibold tabular-nums">
                    {formatCurrency(order.total_amount)}
                  </p>

                  <OrderStatusSelect
                    orderId={order.id}
                    status={order.status}
                    compact
                    onChanged={(next) =>
                      toast.info(`Marked as ${ORDER_STATUS_META[next].label}`, {
                        description: 'Inventory has been reconciled automatically.',
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
