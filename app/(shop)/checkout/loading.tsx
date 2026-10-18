import { Skeleton } from '@/components/ui/skeleton';

export default function CheckoutLoading() {
  return (
    <div className="container-tight py-10">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  );
}
