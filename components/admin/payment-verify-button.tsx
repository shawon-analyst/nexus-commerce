'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { cn, humanizeError } from '@/lib/utils';

/**
 * "Money received" button for a manual bKash transfer.
 *
 * Calls the admin-only `verify_payment()` RPC, which flips
 * `payment_status` to 'paid' and (for an order still pending) advances it to
 * 'processing' — atomically, server-side, so a tampered client cannot fake it.
 */
export function VerifyPaymentButton({
  orderId,
  paymentStatus,
  label = 'Verify payment',
  title,
  onVerified,
  className,
}: {
  orderId: string;
  paymentStatus: string;
  label?: string;
  title?: string;
  onVerified?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  // Nothing to verify once the money is confirmed.
  if (paymentStatus === 'paid') return null;

  async function verify() {
    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('verify_payment', { p_order_id: orderId });

      if (error) {
        toast.error('Could not verify the payment', { description: humanizeError(error) });
        return;
      }

      if (!data) {
        toast.error('Verification blocked', {
          description: 'Your account does not have permission to verify payments.',
        });
        return;
      }

      toast.success('Payment verified', {
        description: `Order #${orderId.slice(0, 8).toUpperCase()} is marked paid and moved to processing.`,
      });

      onVerified?.();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => void verify()}
      disabled={pending}
      title={title ?? label}
      aria-label={title ?? label ?? 'Verify payment'}
      className={cn('gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600/90', className)}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <BadgeCheck className="h-3.5 w-3.5" />
      )}
      {pending ? 'Verifying…' : label}
    </Button>
  );
}
