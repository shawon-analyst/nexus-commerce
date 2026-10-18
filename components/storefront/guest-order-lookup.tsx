import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Phone, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrderCard } from '@/components/storefront/order-card';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError, toNumber } from '@/lib/utils';
import type { OrderItem, OrderWithItems } from '@/lib/types';

/**
 * Fallback order view for guests (and for signed-in users opening somebody
 * else's order). Authorisation happens inside the `track_order` SQL function:
 * the phone number used at checkout acts as the shared secret.
 */
export function GuestOrderLookup({
  orderId,
  initialPhone = '',
  justPlaced = false,
}: {
  orderId: string;
  initialPhone?: string;
  justPlaced?: boolean;
}) {
  const [phone, setPhone] = React.useState(initialPhone);
  const [order, setOrder] = React.useState<OrderWithItems | null>(null);
  const [loading, setLoading] = React.useState(Boolean(initialPhone));
  const [message, setMessage] = React.useState<string | null>(null);

  const lookup = React.useCallback(
    async (phoneToUse: string) => {
      if (!phoneToUse.trim()) {
        setMessage('Enter the phone number you used at checkout.');
        return;
      }
      setLoading(true);
      setMessage(null);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.rpc('track_order', {
          p_order_id: orderId,
          p_phone: phoneToUse.trim(),
        });

        if (error) {
          setMessage(humanizeError(error));
          return;
        }

        const payload = data as unknown as
          | { error?: string; order?: Record<string, unknown>; items?: OrderItem[] }
          | null;

        if (!payload || payload.error || !payload.order) {
          setMessage('We could not match that phone number to this order.');
          return;
        }

        setOrder({
          ...(payload.order as unknown as OrderWithItems),
          total_amount: toNumber(payload.order.total_amount),
          shipping_fee: toNumber(payload.order.shipping_fee),
          order_items: (payload.items ?? []).map((item) => ({
            ...item,
            quantity: toNumber(item.quantity),
            unit_price: toNumber(item.unit_price),
          })),
        });
      } finally {
        setLoading(false);
      }
    },
    [orderId],
  );

  // arriving straight from checkout: the phone is already in the URL
  React.useEffect(() => {
    if (initialPhone) void lookup(initialPhone);
    else setLoading(false);
  }, [initialPhone, lookup]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {justPlaced && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">Thank you — your order is confirmed!</p>
            <p className="mt-0.5 text-sm text-emerald-800">
              We reserved your items and set the stock aside. Keep this page or the order ID handy
              to track progress.
            </p>
          </div>
        </div>
      )}

      {order ? (
        <>
          <OrderCard order={order} showCancel onCancelled={() => setOrder(null)} />
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild variant="outline">
              <Link href="/products">
                <ShoppingBag className="h-4 w-4" /> Continue shopping
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/orders">All my orders</Link>
            </Button>
          </div>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Phone className="h-4 w-4" /> Verify it is your order
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void lookup(phone);
              }}
              className="grid gap-3"
            >
              <div className="grid gap-1.5">
                <Label htmlFor="lookup-phone">Phone number used at checkout</Label>
                <Input
                  id="lookup-phone"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="01712 345678"
                  inputMode="tel"
                  required
                />
              </div>
              <Button type="submit" loading={loading}>
                Show my order
              </Button>
              {message && <p className="text-sm text-destructive">{message}</p>}
              <p className="text-xs text-muted-foreground">
                Order reference: <span className="font-mono">{orderId.slice(0, 8).toUpperCase()}</span>
              </p>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
