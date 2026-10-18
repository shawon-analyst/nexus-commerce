'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * A bKash transaction id rendered as a copy button — used on the customer's
 * order page and in the admin orders table/dialog, so nobody has to retype it
 * into the bKash app to check a transfer.
 */
export function TrxIdChip({
  value,
  className,
  showLabel = true,
}: {
  value: string | null | undefined;
  className?: string;
  showLabel?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  if (!value) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value as string);
    } catch {
      // Clipboard access can be blocked (insecure origin / denied permission).
      window.prompt('Copy the Transaction ID', value as string);
      return;
    }
    setCopied(true);
    toast.success('Transaction ID copied');
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      title="Copy Transaction ID"
      className={cn(
        'group inline-flex max-w-full items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 font-mono text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25',
        className,
      )}
    >
      {showLabel && <span className="font-sans font-semibold">TrxID</span>}
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}
