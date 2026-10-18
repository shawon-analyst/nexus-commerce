'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ORDER_STATUS_FLOW,
  ORDER_STATUS_META,
  PAYMENT_METHOD_META,
  cn,
  humanizeError,
  paymentStatusMeta,
} from '@/lib/utils';
import type { OrderStatus, PaymentMethod } from '@/lib/types';

const ALL_STATUSES: OrderStatus[] = [
  'pending',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];

/**
 * Single-click status updater.
 * Writing `status` is all it takes: the Postgres trigger restores stock when the
 * new value is 'cancelled' and re-reserves it if the order is re-opened.
 */
export function OrderStatusSelect({
  orderId,
  status,
  onChanged,
  compact = false,
}: {
  orderId: string;
  status: OrderStatus;
  onChanged?: (next: OrderStatus) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState<OrderStatus>(status);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => setValue(status), [status]);

  const update = React.useCallback(
    async (next: OrderStatus) => {
      if (next === value) return;
      const previous = value;
      setValue(next);
      setPending(true);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from('orders')
          .update({ status: next })
          .eq('id', orderId)
          .select('id, status, stock_restored')
          .maybeSingle();

        if (error) {
          setValue(previous);
          toast.error('Status update failed', { description: humanizeError(error) });
          return;
        }

        if (!data) {
          setValue(previous);
          toast.error('Status update blocked', {
            description: 'Your account does not have permission to change this order.',
          });
          return;
        }

        toast.success(
          `Order #${orderId.slice(0, 8).toUpperCase()} → ${ORDER_STATUS_META[next].label}`,
          {
            description:
              next === 'cancelled'
                ? 'Stock was restored to inventory automatically.'
                : previous === 'cancelled'
                  ? 'Stock was re-reserved for this order.'
                  : undefined,
          },
        );

        onChanged?.(next);
        router.refresh();
      } finally {
        setPending(false);
      }
    },
    [onChanged, orderId, router, value],
  );

  const nextStep = ORDER_STATUS_FLOW[ORDER_STATUS_FLOW.indexOf(value) + 1];

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <Select
          value={value}
          onValueChange={(next) => void update(next as OrderStatus)}
          disabled={pending}
        >
          <SelectTrigger
            className={cn(
              'h-8 border font-medium',
              compact ? 'w-[132px] text-xs' : 'w-[150px] text-xs',
              ORDER_STATUS_META[value].className,
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_STATUSES.map((option) => (
              <SelectItem key={option} value={option} className="text-xs">
                <span className="flex items-center gap-2">
                  <span className={cn('h-1.5 w-1.5 rounded-full', ORDER_STATUS_META[option].dot)} />
                  {ORDER_STATUS_META[option].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending && (
          <Loader2 className="pointer-events-none absolute -right-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {nextStep && value !== 'cancelled' && (
        <Button
          size="icon-sm"
          variant="outline"
          disabled={pending}
          onClick={() => void update(nextStep)}
          title={`Advance to ${ORDER_STATUS_META[nextStep].label}`}
          aria-label={`Advance order to ${ORDER_STATUS_META[nextStep].label}`}
        >
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

/**
 * Payment summary used in the orders table and the order dialog.
 * Shows *how* the customer is paying (COD / bKash / online) alongside *where the
 * money currently stands* ('Awaiting review' until an admin verifies a bKash
 * transfer).
 */
export function PaymentBadge({
  method,
  status,
  className,
}: {
  method: string;
  status: string;
  className?: string;
}) {
  const methodMeta = PAYMENT_METHOD_META[method as PaymentMethod] ?? PAYMENT_METHOD_META.cod;
  const statusMeta = paymentStatusMeta(status);
  const isBkash = method === 'bkash';

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Badge
        variant={isBkash ? 'outline' : 'secondary'}
        className={cn(
          'font-normal',
          isBkash &&
            'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300',
        )}
      >
        {methodMeta.short}
      </Badge>
      <Badge variant="outline" className={cn('font-normal', statusMeta.className)}>
        {statusMeta.label}
      </Badge>
    </div>
  );
}

export function CollapsedIndicator() {
  return <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />;
}
