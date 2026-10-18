import { PageHeadingSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminOrdersLoading() {
  return (
    <div className="space-y-5">
      <PageHeadingSkeleton />
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-9 w-full max-w-sm" />
      </div>
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
