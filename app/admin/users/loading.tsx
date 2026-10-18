import { PageHeadingSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminUsersLoading() {
  return (
    <div className="space-y-5">
      <PageHeadingSkeleton />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <Skeleton className="h-9 w-full max-w-xl" />
      </div>
      <TableSkeleton rows={8} columns={6} />
    </div>
  );
}
