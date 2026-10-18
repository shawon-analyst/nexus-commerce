'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error('[app-error]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-7 w-7 text-destructive" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Something broke</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || 'An unexpected error occurred while rendering this page.'}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">ref: {error.digest}</p>
        )}
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={reset}>
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
