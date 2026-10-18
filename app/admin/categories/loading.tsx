import { PageHeadingSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function AdminCategoriesLoading() {
  return (
    <div className="space-y-5">
      <PageHeadingSkeleton />
      <div className="flex justify-end rounded-xl border bg-card p-4">
        <Skeleton className="h-9 w-36" />
      </div>
      <TableSkeleton rows={5} columns={4} />
    </div>
  );
}
