import { Skeleton } from '@/components/ui/skeleton';

export default function CartLoading() {
  return (
    <div className="container-tight py-10">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-4 rounded-xl border bg-card p-4">
              <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
