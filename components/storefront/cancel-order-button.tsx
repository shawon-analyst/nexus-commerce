'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError } from '@/lib/utils';

/**
 * Calls the `cancel_order` PostgreSQL function.
 * Postgres does the heavy lifting: status -> 'cancelled' and the BEFORE UPDATE
 * trigger returns every unit to the products table in the same transaction.
 */
export function CancelOrderButton({
  orderId,
  onCancelled,
  size = 'sm',
  variant = 'outline',
}: {
  orderId: string;
  onCancelled?: () => void;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'destructive' | 'ghost';
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function cancel() {
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.rpc('cancel_order', { p_order_id: orderId });

      if (error) {
        toast.error('Could not cancel order', { description: humanizeError(error) });
        return;
      }

      toast.success('Order cancelled', {
        description: 'Stock has been returned to inventory automatically.',
      });
      setOpen(false);
      onCancelled?.();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Ban className="h-3.5 w-3.5" /> Cancel order
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this order?</DialogTitle>
          <DialogDescription>
            This cannot be undone. Every item will be returned to stock immediately, and the
            products become available to other shoppers again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Keep my order
          </Button>
          <Button variant="destructive" onClick={() => void cancel()} loading={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Yes, cancel it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
