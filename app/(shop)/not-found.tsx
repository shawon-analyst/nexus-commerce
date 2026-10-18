import Link from 'next/link';
import { PackageSearch, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ShopNotFound() {
  return (
    <div className="container-tight py-20">
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <PackageSearch className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">We could not find that</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The product may have been removed, or the link is incorrect.
        </p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/products">
              <ShoppingBag className="h-4 w-4" /> Browse the catalogue
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Go home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
