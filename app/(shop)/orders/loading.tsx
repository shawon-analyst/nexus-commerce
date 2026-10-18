import { OrderCardsSkeleton, PageHeadingSkeleton } from '@/components/ui/loading-skeletons';

export default function OrdersLoading() {
  return (
    <div className="container-tight py-10">
      <PageHeadingSkeleton />
      <OrderCardsSkeleton count={3} />
    </div>
  );
}
