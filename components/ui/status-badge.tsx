import { Badge } from '@/components/ui/badge';
import { ORDER_STATUS_META } from '@/lib/utils';
import type { OrderStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export function OrderStatusBadge({
  status,
  className,
  showDot = true,
}: {
  status: OrderStatus;
  className?: string;
  showDot?: boolean;
}) {
  const meta = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.pending;
  return (
    <Badge
      variant="outline"
      className={cn('border font-medium', meta.className, className)}
    >
      {showDot && <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />}
      {meta.label}
    </Badge>
  );
}

export function RealtimeDot({ status }: { status: 'connecting' | 'live' | 'offline' }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className="relative flex h-2 w-2">
        {status === 'live' && (
          <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-emerald-500" />
        )}
        <span
          className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            status === 'live' && 'bg-emerald-500',
            status === 'connecting' && 'bg-amber-500',
            status === 'offline' && 'bg-rose-500',
          )}
        />
      </span>
      {status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline'}
    </span>
  );
}
