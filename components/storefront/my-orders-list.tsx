'use client';

import * as React from 'react';
import Link from 'next/link';
import { Package, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RealtimeDot } from '@/components/ui/status-badge';
import { OrderCard } from '@/components/storefront/order-card';
import { useRealtimeOrders } from '@/hooks/use-realtime';
import { ORDER_STATUS_META } from '@/lib/utils';
import type { OrderWithItems } from '@/lib/types';

/**
 * Customer order history with live status updates — the badge changes the
 * moment the shop owner moves the parcel to the next stage.
 */
export function MyOrdersList({ initialOrders }: { initialOrders: OrderWithItems[] }) {
  const { orders, status, setOrders } = useRealtimeOrders(initialOrders, {
    channelName: 'my-orders',
    onStatusChange: (order) => {
      const meta = ORDER_STATUS_META[order.status];
      toast.info(`Order #${order.id.slice(0, 8).toUpperCase()} is now ${meta?.label ?? order.status}`, {
        description:
          order.status === 'cancelled'
            ? 'The items were returned to stock automatically.'
            : 'Follow the timeline below for details.',
      });
    },
  });

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No orders yet"
        description="When you place an order it will appear here with a live status timeline."
        action={
          <Button asChild>
            <Link href="/products">Start shopping</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {orders.length} {orders.length === 1 ? 'order' : 'orders'} · newest first
        </p>
        <div className="flex items-center gap-3">
          <RealtimeDot status={status} />
          <Button variant="ghost" size="sm" onClick={() => setOrders(initialOrders)}>
            <RefreshCw className="h-3.5 w-3.5" /> Sync
          </Button>
        </div>
      </div>

      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          showCancel
          onCancelled={() =>
            setOrders((prev) =>
              prev.map((o) => (o.id === order.id ? { ...o, status: 'cancelled' } : o)),
            )
          }
          className="animate-fade-in"
        />
      ))}
    </div>
  );
}
