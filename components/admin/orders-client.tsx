'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Boxes,
  Download,
  Eye,
  Filter,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/ui/safe-image';
import { RealtimeDot } from '@/components/ui/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { OrderStatusSelect, PaymentBadge } from '@/components/admin/order-status-control';
import { VerifyPaymentButton } from '@/components/admin/payment-verify-button';
import { TrxIdChip } from '@/components/ui/trx-id-chip';
import { useRealtimeOrders } from '@/hooks/use-realtime';
import { ORDER_STATUS_META, cn, deliveryAreaMeta, formatCurrency, formatDateTime, timeAgo, toNumber } from '@/lib/utils';
import type { OrderStatus, OrderWithItems } from '@/lib/types';

const STATUS_FILTERS: Array<{ value: OrderStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function OrdersClient({ initialOrders }: { initialOrders: OrderWithItems[] }) {
  const [filter, setFilter] = React.useState<OrderStatus | 'all'>('all');
  const [term, setTerm] = React.useState('');
  const [onlyUnverified, setOnlyUnverified] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const { orders, status } = useRealtimeOrders(initialOrders, {
    channelName: 'admin-orders-table',
    onNewOrder: (order) => {
      toast.success('New order received 🎉', {
        description: `${order.customer_name} · ${formatCurrency(order.total_amount)}`,
        duration: 8000,
      });
    },
  });

  const counts = React.useMemo(() => {
    const base: Record<string, number> = { all: orders.length };
    orders.forEach((order) => {
      base[order.status] = (base[order.status] ?? 0) + 1;
    });
    return base;
  }, [orders]);

  /** bKash transfers a customer says they sent but nobody has confirmed yet. */
  const awaitingVerification = React.useMemo(
    () => orders.filter((order) => order.payment_status === 'pending_verification').length,
    [orders],
  );

  const filtered = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== 'all' && order.status !== filter) return false;
      if (onlyUnverified && order.payment_status !== 'pending_verification') return false;
      if (!needle) return true;
      return (
        order.id.toLowerCase().includes(needle) ||
        (order.customer_name ?? '').toLowerCase().includes(needle) ||
        order.phone.toLowerCase().includes(needle) ||
        order.shipping_address.toLowerCase().includes(needle) ||
        (order.transaction_id ?? '').toLowerCase().includes(needle)
      );
    });
  }, [filter, onlyUnverified, orders, term]);

  const selected = orders.find((order) => order.id === selectedId) ?? null;

  const revenue = filtered
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + toNumber(order.total_amount), 0);

  function exportCsv() {
    const header = [
      'Order ID',
      'Customer',
      'Phone',
      'Address',
      'Items',
      'Total',
      'Payment',
      'Payment status',
      'TrxID',
      'Status',
      'Placed at',
    ];
    const rows = filtered.map((order) => [
      order.id,
      order.customer_name,
      order.phone,
      order.shipping_address.replace(/\s+/g, ' '),
      String(order.order_items?.length ?? 0),
      toNumber(order.total_amount).toFixed(2),
      order.payment_method,
      order.payment_status,
      order.transaction_id ?? '',
      order.status,
      order.created_at,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} orders`);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Orders</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <RealtimeDot status={status} />
            <span>
              {counts.all ?? 0} total · {formatCurrency(revenue)} in the current view
            </span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </header>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
              <Filter className="mr-1 h-4 w-4 shrink-0 text-muted-foreground" />
              {STATUS_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    filter === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {option.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                      filter === option.value ? 'bg-primary-foreground/20' : 'bg-muted',
                    )}
                  >
                    {counts[option.value] ?? 0}
                  </span>
                </button>
              ))}

              <span className="mx-1 h-5 w-px shrink-0 bg-border" />

              <button
                type="button"
                onClick={() => setOnlyUnverified((value) => !value)}
                aria-pressed={onlyUnverified}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  onlyUnverified
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : 'border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-500/10',
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Awaiting bKash
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                    onlyUnverified ? 'bg-white/25' : 'bg-rose-100 dark:bg-rose-500/20',
                  )}
                >
                  {awaitingVerification}
                </span>
              </button>
            </div>

            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search name, phone, address, ID…"
                className="pl-9"
              />
            </div>
          </div>

          <Separator />

          {filtered.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title={orders.length === 0 ? 'No orders yet' : 'No orders match this filter'}
              description={
                orders.length === 0
                  ? 'Orders appear here in real time the moment a customer checks out.'
                  : 'Try a different status filter or clear the search box.'
              }
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden md:table-cell">Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead className="hidden sm:table-cell">Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Placed</TableHead>
                    <TableHead className="text-right">View</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((order) => (
                    <TableRow key={order.id} className="animate-fade-in">
                      <TableCell>
                        <span className="font-mono text-xs font-medium">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{order.customer_name || 'Guest'}</p>
                        <p className="text-xs text-muted-foreground">{order.phone}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-sm">{order.order_items?.length ?? 0}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(order.total_amount)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-col items-start gap-1">
                          <PaymentBadge
                            method={order.payment_method}
                            status={order.payment_status}
                          />
                          {order.payment_method === 'bkash' && order.transaction_id && (
                            <TrxIdChip value={order.transaction_id} className="max-w-[160px]" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <OrderStatusSelect
                          orderId={order.id}
                          status={order.status}
                          compact
                        />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(order.created_at)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {order.payment_status === 'pending_verification' && (
                            <VerifyPaymentButton
                              orderId={order.id}
                              paymentStatus={order.payment_status}
                              label=""
                              title="Verify bKash payment"
                              className="h-8 w-8 shrink-0 px-0"
                            />
                          )}
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setSelectedId(order.id)}
                            aria-label="View order"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <OrderDetailDialog
        order={selected}
        onOpenChange={(open) => !open && setSelectedId(null)}
      />
    </div>
  );
}

function OrderDetailDialog({
  order,
  onOpenChange,
}: {
  order: OrderWithItems | null;
  onOpenChange: (open: boolean) => void;
}) {
  if (!order) return null;

  const items = order.order_items ?? [];

  return (
    <Dialog open={Boolean(order)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Order #{order.id.slice(0, 8).toUpperCase()}{' '}
            <Badge
              variant="outline"
              className={cn('ml-2 border font-medium', ORDER_STATUS_META[order.status].className)}
            >
              {ORDER_STATUS_META[order.status].label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Placed {formatDateTime(order.created_at)} ·{' '}
            {order.stock_restored ? 'stock returned to inventory' : 'stock reserved'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
            <OrderStatusSelect orderId={order.id} status={order.status} />
            <p className="text-xs text-muted-foreground">
              Cancelling restores every unit automatically.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <User className="h-3.5 w-3.5" /> Customer
              </p>
              <p className="mt-1.5 text-sm font-medium">{order.customer_name || 'Guest'}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5" /> {order.phone}
              </p>
              <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-pre-line">{order.shipping_address}</span>
              </p>
              {order.notes && (
                <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                  Note: {order.notes}
                </p>
              )}
            </div>

            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Payment
              </p>
              <div className="mt-1.5">
                <PaymentBadge method={order.payment_method} status={order.payment_status} />
              </div>

              {order.payment_method === 'bkash' && (
                <div className="mt-3 rounded-md border border-rose-200 bg-rose-50/70 p-2.5 dark:border-rose-500/30 dark:bg-rose-500/10">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                    Customer&apos;s bKash TrxID
                  </p>
                  <div className="mt-1.5">
                    {order.transaction_id ? (
                      <TrxIdChip
                        value={order.transaction_id}
                        showLabel={false}
                        className="text-xs"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        No transaction id was supplied.
                      </p>
                    )}
                  </div>

                  {order.payment_status !== 'paid' && (
                    <VerifyPaymentButton
                      orderId={order.id}
                      paymentStatus={order.payment_status}
                      className="mt-2.5 w-full"
                    />
                  )}
                </div>
              )}
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Items</dt>
                  <dd className="tabular-nums">
                    {items.reduce((sum, item) => sum + toNumber(item.quantity), 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    Delivery
                    {order.delivery_area && (
                      <span className="ml-1 text-[11px] text-muted-foreground/70">
                        ({deliveryAreaMeta(order.delivery_area).short})
                      </span>
                    )}
                  </dt>
                  <dd className="tabular-nums">
                    {toNumber(order.shipping_fee) > 0
                      ? formatCurrency(order.shipping_fee)
                      : 'Free'}
                  </dd>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatCurrency(order.total_amount)}</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <SafeImage
                          src={item.product_image}
                          alt={item.product_title}
                          wrapperClassName="h-10 w-10 shrink-0 rounded-md border"
                          sizes="40px"
                        />
                        {item.product_id ? (
                          <Link
                            href={`/products/${item.product_id}`}
                            target="_blank"
                            className="text-sm font-medium hover:underline"
                          >
                            {item.product_title || 'Product'}
                          </Link>
                        ) : (
                          <span className="text-sm">{item.product_title || 'Removed product'}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(item.unit_price)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(toNumber(item.unit_price) * toNumber(item.quantity))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
