import { PageHeadingSkeleton, ProductGridSkeleton } from '@/components/ui/loading-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function ProductsLoading() {
  return (
    <div className="container-tight py-8">
      <PageHeadingSkeleton />
      <Skeleton className="h-14 w-full rounded-xl" />
      <ProductGridSkeleton count={8} className="mt-6" />
    </div>
  );
}
