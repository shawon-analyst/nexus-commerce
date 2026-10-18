import { Check, Clock, Package, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { ORDER_STATUS_FLOW, ORDER_STATUS_META, cn } from '@/lib/utils';
import type { OrderStatus } from '@/lib/types';

const ICONS = {
  pending: Clock,
  processing: Package,
  shipped: Truck,
  delivered: ShieldCheck,
} as const;

export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
        <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
        <div>
          <p className="text-sm font-semibold text-rose-900">Order cancelled</p>
          <p className="text-xs text-rose-700">
            The reserved stock has been returned to inventory automatically.
          </p>
        </div>
      </div>
    );
  }

  const currentStep = ORDER_STATUS_META[status]?.step ?? 0;

  return (
    <ol className="flex items-center">
      {ORDER_STATUS_FLOW.map((step, index) => {
        const Icon = ICONS[step as keyof typeof ICONS];
        const meta = ORDER_STATUS_META[step];
        const done = index <= currentStep;
        const active = index === currentStep;

        return (
          <li key={step} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors',
                  done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground',
                  active && 'ring-4 ring-primary/15',
                )}
              >
                {done && !active ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  'whitespace-nowrap text-[11px] font-medium',
                  done ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {meta.label}
              </span>
            </div>

            {index < ORDER_STATUS_FLOW.length - 1 && (
              <div
                className={cn(
                  'mx-1.5 mb-5 h-0.5 flex-1 rounded-full',
                  index < currentStep ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
