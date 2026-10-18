import { OrderCardsSkeleton } from '@/components/ui/loading-skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function OrderDetailLoading() {
  return (
    <div className="container-tight py-10">
      <Skeleton className="mb-6 h-8 w-32" />
      <div className="mx-auto max-w-3xl">
        <OrderCardsSkeleton count={1} />
      </div>
    </div>
  );
}
