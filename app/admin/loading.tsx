import { PageHeadingSkeleton, StatCardsSkeleton, TableSkeleton } from '@/components/ui/loading-skeletons';

export default function AdminLoading() {
  return (
    <div className="space-y-5">
      <PageHeadingSkeleton />
      <StatCardsSkeleton />
      <TableSkeleton rows={5} columns={5} />
    </div>
  );
}
