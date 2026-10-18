import { PageHeadingSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminProductsLoading() {
  return (
    <div className="space-y-5">
      <PageHeadingSkeleton />
      <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
        <Skeleton className="h-9 w-full max-w-xs" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="ml-auto h-9 w-32" />
      </div>
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
