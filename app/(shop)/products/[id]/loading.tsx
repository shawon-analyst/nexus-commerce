import { Skeleton } from '@/components/ui/skeleton';

export default function ProductDetailLoading() {
  return (
    <div className="container-tight py-8">
      <Skeleton className="mb-6 h-4 w-40" />
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-4/5" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-11 w-56 rounded-md" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
