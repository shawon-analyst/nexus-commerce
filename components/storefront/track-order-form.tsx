'use client';

import * as React from 'react';
import { SearchCheck, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrderCard } from '@/components/storefront/order-card';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError, toNumber } from '@/lib/utils';
import type { OrderItem, OrderWithItems } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guest order tracking. The RPC `track_order` validates the phone number
 * server-side, so a random visitor cannot enumerate other people's orders.
 */
export function TrackOrderForm({ compact = false }: { compact?: boolean }) {
  const [orderId, setOrderId] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<OrderWithItems | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!UUID_RE.test(orderId.trim())) {
      toast.error('Order reference looks wrong', {
        description: 'Paste the full order ID from your confirmation page.',
      });
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('track_order', {
        p_order_id: orderId.trim(),
        p_phone: phone.trim(),
      });

      if (error) {
        toast.error('Lookup failed', { description: humanizeError(error) });
        return;
      }

      const payload = data as unknown as
        | { error?: string; order?: Record<string, unknown>; items?: OrderItem[] }
        | null;

      if (!payload || payload.error) {
        toast.error(
          payload?.error === 'NOT_AUTHORIZED'
            ? 'Those details do not match any order.'
            : 'Order not found.',
          { description: 'Check the order ID and the phone number used at checkout.' },
        );
        setResult(null);
        return;
      }

      setResult({
        ...(payload.order as unknown as OrderWithItems),
        total_amount: toNumber(payload.order?.total_amount),
        shipping_fee: toNumber(payload.order?.shipping_fee),
        order_items: (payload.items ?? []).map((item) => ({
          ...item,
          quantity: toNumber(item.quantity),
          unit_price: toNumber(item.unit_price),
        })),
      });
      toast.success('Order found');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ticket className="h-4 w-4" /> Track an order without signing in
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className={compact ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end'}>
            <div className="grid gap-1.5">
              <Label htmlFor="track-order-id">Order ID</Label>
              <Input
                id="track-order-id"
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                placeholder="e.g. 3f7a1c92-…"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="track-phone">Phone number used</Label>
              <Input
                id="track-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="01712 345678"
                inputMode="tel"
                required
              />
            </div>
            <Button type="submit" loading={loading} className="sm:mb-0">
              <SearchCheck className="h-4 w-4" /> Track
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && <OrderCard order={result} showCancel onCancelled={() => setResult(null)} />}
    </div>
  );
}
