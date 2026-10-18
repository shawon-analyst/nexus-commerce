import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Shared loading placeholders.
 *
 * Every route has a `loading.tsx` built from these, which is what makes
 * navigation feel instant: Next streams the skeleton the moment a link is
 * clicked (and prefetches it for in-viewport links) instead of leaving the
 * previous page frozen while the server render finishes.
 */

export function PageHeadingSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('mb-6 space-y-2', className)}>
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

export function ProductGridSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border bg-card">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border', className)}>
      <div className="flex gap-4 border-b bg-muted/40 p-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 border-b p-3 last:border-0">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn('h-4 flex-1', columnIndex === 0 && 'max-w-[90px]')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatCardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-xl border bg-card p-5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}

export function OrderCardsSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-5', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <Skeleton className="h-2 w-full" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-14 w-14 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Hero + featured rail placeholder for the homepage. */
export function StorefrontHomeSkeleton() {
  return (
    <div className="animate-in fade-in duration-200">
      <section className="border-b">
        <div className="container-tight grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div className="space-y-5">
            <Skeleton className="h-6 w-64 rounded-full" />
            <Skeleton className="h-12 w-full max-w-md" />
            <Skeleton className="h-12 w-2/3 max-w-sm" />
            <Skeleton className="h-4 w-full max-w-lg" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="h-11 w-40 rounded-md" />
              <Skeleton className="h-11 w-40 rounded-md" />
            </div>
            <div className="grid max-w-lg grid-cols-3 gap-4 pt-4">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-20 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="aspect-[4/3] rounded-2xl" />
            ))}
          </div>
        </div>
      </section>

      <section className="container-tight py-14">
        <Skeleton className="mb-7 h-8 w-48" />
        <ProductGridSkeleton count={4} className="lg:grid-cols-4 xl:grid-cols-4" />
      </section>
    </div>
  );
}
