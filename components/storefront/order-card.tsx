import Link from 'next/link';
import { MapPin, Phone, Receipt, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/ui/safe-image';
import { OrderStatusBadge } from '@/components/ui/status-badge';
import { CancelOrderButton } from '@/components/storefront/cancel-order-button';
import { OrderStatusTimeline } from '@/components/storefront/order-status-timeline';
import { TrxIdChip } from '@/components/ui/trx-id-chip';
import { formatCurrency, formatDateTime, paymentStatusMeta, toNumber, PAYMENT_METHOD_META, deliveryAreaMeta } from '@/lib/utils';
import type { OrderWithItems } from '@/lib/types';

/**
 * Presentational order summary — used by the customer order pages, the guest
 * tracking form and the admin order detail drawer.
 */
export function OrderCard({
  order,
  showCancel = false,
  onCancelled,
  className,
}: {
  order: OrderWithItems;
  showCancel?: boolean;
  onCancelled?: () => void;
  className?: string;
}) {
  const items = order.order_items ?? [];
  const canCancel = showCancel && order.status === 'pending';
  // `total_amount` covers goods *and* delivery (see place_order in SQL), so the
  // line item above it has to take the fee back out. Legacy rows predate the
  // `shipping_fee` column and store the goods total, giving 0 here — which is
  // exactly right for them.
  const shippingFee = toNumber(order.shipping_fee);
  const goodsOnly = Math.max(toNumber(order.total_amount) - shippingFee, 0);

  return (
    <Card className={className}>
      <CardHeader className="gap-3 border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              Order{' '}
              <span className="font-mono text-sm text-muted-foreground">
                #{order.id.slice(0, 8).toUpperCase()}
              </span>
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Placed {formatDateTime(order.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <OrderStatusBadge status={order.status} />
            {canCancel && <CancelOrderButton orderId={order.id} onCancelled={onCancelled} />}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        <OrderStatusTimeline status={order.status} />

        <Separator className="my-6" />

        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <SafeImage
                src={item.product_image}
                alt={item.product_title}
                wrapperClassName="h-14 w-14 shrink-0 rounded-lg border"
                sizes="56px"
              />
              <div className="min-w-0 flex-1">
                {item.product_id ? (
                  <Link
                    href={`/products/${item.product_id}`}
                    className="line-clamp-1 text-sm font-medium hover:underline"
                  >
                    {item.product_title || 'Product'}
                  </Link>
                ) : (
                  <p className="line-clamp-1 text-sm font-medium">
                    {item.product_title || 'Product (removed)'}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {item.quantity} × {formatCurrency(item.unit_price)}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {formatCurrency(toNumber(item.unit_price) * toNumber(item.quantity))}
              </p>
            </li>
          ))}
          {items.length === 0 && (
            <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No line items recorded for this order.
            </li>
          )}
        </ul>

        <Separator className="my-6" />

        <div className="grid gap-4 sm:grid-cols-2">
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Delivery address</dt>
                <dd className="whitespace-pre-line">{order.shipping_address}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Contact</dt>
                <dd>{order.phone}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Payment</dt>
                <dd>
                  {PAYMENT_METHOD_META[order.payment_method]?.label ?? order.payment_method} ·{' '}
                  {paymentStatusMeta(order.payment_status).label}
                </dd>
                {order.transaction_id && (
                  <dd className="mt-1.5">
                    <TrxIdChip value={order.transaction_id} />
                  </dd>
                )}
              </div>
            </div>
          </dl>

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Receipt className="h-3.5 w-3.5" /> Summary
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Items ({items.reduce((sum, i) => sum + toNumber(i.quantity), 0)})
                </dt>
                <dd className="tabular-nums">{formatCurrency(goodsOnly)}</dd>
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
                <dd className={shippingFee > 0 ? 'tabular-nums' : 'text-emerald-600'}>
                  {shippingFee > 0 ? formatCurrency(shippingFee) : 'Free'}
                </dd>
              </div>
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCurrency(order.total_amount)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
