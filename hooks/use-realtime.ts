'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { toNumber } from '@/lib/utils';
import type { Order, OrderItem, OrderWithItems, Product, ProductWithCategory, AdminUserRow } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Normalisation — realtime payloads may deliver NUMERIC columns as strings  */
/* -------------------------------------------------------------------------- */

function normalizeOrder(row: Record<string, unknown>): Order {
  return {
    ...(row as unknown as Order),
    total_amount: toNumber(row.total_amount),
    shipping_fee: toNumber(row.shipping_fee),
  };
}

function normalizeItems(rows: unknown): OrderItem[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    ...(r as OrderItem),
    quantity: toNumber((r as OrderItem).quantity),
    unit_price: toNumber((r as OrderItem).unit_price),
  }));
}

/* -------------------------------------------------------------------------- */
/*  Connection status pill                                                    */
/* -------------------------------------------------------------------------- */

export type RealtimeStatus = 'connecting' | 'live' | 'offline';

/* -------------------------------------------------------------------------- */
/*  ORDERS — used by the admin order console and the customer order list      */
/* -------------------------------------------------------------------------- */

type UseRealtimeOrdersOptions = {
  /** fired on every brand new order (admin console uses it for the toast) */
  onNewOrder?: (order: OrderWithItems) => void;
  /** fired when a status transition happens somewhere else */
  onStatusChange?: (order: Order) => void;
  channelName?: string;
};

export function useRealtimeOrders(
  initialOrders: OrderWithItems[],
  options: UseRealtimeOrdersOptions = {},
) {
  const { onNewOrder, onStatusChange, channelName = 'orders-stream' } = options;
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders);
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  // keep the freshest callbacks without re-subscribing the channel
  const callbacks = useRef({ onNewOrder, onStatusChange });
  callbacks.current = { onNewOrder, onStatusChange };

  // server-rendered truth wins whenever the RSC payload changes
  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const channel: RealtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        async (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const inserted = normalizeOrder(payload.new as Record<string, unknown>);
          setLastEventAt(new Date());

          // `place_order()` writes the row first and sets the final total in the
          // same transaction, so re-read it to display the committed amount.
          const { data } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('id', inserted.id)
            .maybeSingle();

          if (cancelled) return;

          const enriched: OrderWithItems = data
            ? ({
                ...(data as unknown as Order),
                total_amount: toNumber((data as unknown as Order).total_amount),
                shipping_fee: toNumber((data as unknown as Order).shipping_fee),
                order_items: normalizeItems((data as unknown as OrderWithItems).order_items),
              } as OrderWithItems)
            : { ...inserted, order_items: [] };

          setOrders((prev) =>
            prev.some((o) => o.id === enriched.id) ? prev : [enriched, ...prev],
          );
          callbacks.current.onNewOrder?.(enriched);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const updated = normalizeOrder(payload.new as Record<string, unknown>);
          setLastEventAt(new Date());

          setOrders((prev) =>
            prev.map((o) => {
              if (o.id !== updated.id) return o;
              callbacks.current.onStatusChange?.(updated);
              return { ...o, ...updated, order_items: o.order_items };
            }),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const removed = (payload.old as { id?: string })?.id;
          if (removed) setOrders((prev) => prev.filter((o) => o.id !== removed));
        },
      )
      .subscribe((s) => {
        if (cancelled) return;
        if (s === 'SUBSCRIBED') setStatus('live');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED')
          setStatus('offline');
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [channelName]);

  const stats = useMemo(() => {
    const byStatus = orders.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total: orders.length,
      pending: byStatus.pending ?? 0,
      processing: byStatus.processing ?? 0,
      shipped: byStatus.shipped ?? 0,
      delivered: byStatus.delivered ?? 0,
      cancelled: byStatus.cancelled ?? 0,
      revenue: orders
        .filter((o) => o.status !== 'cancelled')
        .reduce((sum, o) => sum + toNumber(o.total_amount), 0),
    };
  }, [orders]);

  /** Optimistic local patch so the UI feels instant before the DB round-trip. */
  const patchLocal = useCallback((id: string, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  return { orders, setOrders, status, lastEventAt, stats, patchLocal };
}

/* -------------------------------------------------------------------------- */
/*  PRODUCTS — admin inventory grid + storefront stock counters               */
/* -------------------------------------------------------------------------- */

export function useRealtimeProducts(initialProducts: ProductWithCategory[]) {
  const [products, setProducts] = useState<ProductWithCategory[]>(initialProducts);
  const [status, setStatus] = useState<RealtimeStatus>('connecting');

  useEffect(() => {
    setProducts(initialProducts);
  }, [initialProducts]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const channel = supabase
      .channel('products-stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new as unknown as Product;
            const normalized = { ...row, price: toNumber(row.price), stock: toNumber(row.stock) };
            setProducts((prev) => {
              const exists = prev.some((p) => p.id === row.id);
              if (!exists) return [normalized as ProductWithCategory, ...prev];
              return prev.map((p) =>
                p.id === row.id ? { ...p, ...normalized, categories: p.categories } : p,
              );
            });
          } else if (payload.eventType === 'DELETE') {
            const removed = (payload.old as { id?: string })?.id;
            if (removed) setProducts((prev) => prev.filter((p) => p.id !== removed));
          }
        },
      )
      .subscribe((s) => {
        if (cancelled) return;
        if (s === 'SUBSCRIBED') setStatus('live');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED')
          setStatus('offline');
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { products, setProducts, status };
}

/**
 * Live stock counter for the product detail page: a customer watching a product
 * sees the number drop the instant somebody else checks out.
 */
export function useLiveProduct(productId: string, initial: ProductWithCategory | null) {
  const [product, setProduct] = useState(initial);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!productId) return;
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const channel = supabase
      .channel(`product-${productId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'products', filter: `id=eq.${productId}` },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const row = payload.new as unknown as Product;
          setPulse(true);
          window.setTimeout(() => setPulse(false), 1200);
          setProduct((prev) =>
            prev
              ? { ...prev, ...row, price: toNumber(row.price), stock: toNumber(row.stock) }
              : (row as ProductWithCategory),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void cancelled;
      supabase.removeChannel(channel);
    };
  }, [productId]);

  return { product, pulse };
}

/** Small helper for the admin dashboard's "live" indicator. */
export function useRealtimeStatusLabel(status: RealtimeStatus) {
  return status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline';
}

/* -------------------------------------------------------------------------- */
/*  PROFILES — the admin users console                                         */
/* -------------------------------------------------------------------------- */

/** A profile patch: everything except the id may be missing. */
type UserPatch = { id: string } & Partial<AdminUserRow>;

type UseRealtimeUsers = {
  users: AdminUserRow[];
  status: RealtimeStatus;
  lastEventAt: Date | null;
  /**
   * Merge a row we already have in hand — an RPC response or an optimistic edit.
   * A *partial* patch (the realtime payload carries only the `profiles` columns,
   * not the order roll-up the console computed in SQL) keeps whatever it omits.
   */
  upsert: (patch: UserPatch) => void;
  /** Drop a row after a successful delete. */
  remove: (id: string) => void;
};

/**
 * Live user list for `/admin/users`.
 *
 * `profiles` is part of the realtime publication (0009), so a brand-new sign-up,
 * a role change or a block appears without a refresh. Supabase Realtime applies
 * the SELECT policies per subscriber, which means an ordinary shopper who
 * subscribes to this table only ever receives their own row.
 *
 * The order roll-up (`order_count`, `total_spent`, `last_order_at`) is computed by
 * `admin_list_users()` and therefore absent from the broadcast — merges are what
 * keep those columns from being wiped by a rename.
 */
export function useRealtimeUsers(initialUsers: AdminUserRow[]): UseRealtimeUsers {
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers);
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  // server-rendered truth wins whenever the RSC payload changes
  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const upsert = useCallback((patch: UserPatch) => {
    setUsers((prev) => {
      const index = prev.findIndex((user) => user.id === patch.id);
      if (index === -1) {
        // a brand-new profile: fine-grained counts start at zero
        const created = {
          ...(patch as AdminUserRow),
          order_count: toNumber(patch.order_count),
          total_spent: toNumber(patch.total_spent),
          last_order_at: patch.last_order_at ?? null,
        };
        return [created, ...prev];
      }
      const next = [...prev];
      next[index] = { ...prev[index], ...patch, id: prev[index].id };
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setUsers((prev) => prev.filter((user) => user.id !== id));
  }, []);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const channel: RealtimeChannel = supabase
      .channel('profiles-stream')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          setLastEventAt(new Date());

          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string })?.id;
            if (id) remove(id);
            return;
          }

          const row = payload.new as Record<string, unknown> | undefined;
          if (!row || typeof row.id !== 'string') return;
          upsert(row as unknown as UserPatch);
        },
      )
      .subscribe((s) => {
        if (cancelled) return;
        if (s === 'SUBSCRIBED') setStatus('live');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline');
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [remove, upsert]);

  return { users, status, lastEventAt, upsert, remove };
}
