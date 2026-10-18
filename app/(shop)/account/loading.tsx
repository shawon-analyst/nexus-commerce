import { Skeleton } from '@/components/ui/skeleton';
import { StatCardsSkeleton } from '@/components/ui/loading-skeletons';

export default function AccountLoading() {
  return (
    <div className="container-tight py-10">
      <div className="mb-8 space-y-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <StatCardsSkeleton />

      <div className="mt-6 grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-32" />
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-9 w-40" />
            </div>
          </div>
          <div className="space-y-3 rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-48" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-4 rounded-xl border bg-card p-5">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
