import Link from 'next/link';
import { Compass, Home, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Compass className="h-7 w-7 text-primary" />
        </div>
        <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Error 404
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for has moved or never existed.
        </p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild>
            <Link href="/">
              <Home className="h-4 w-4" /> Back home
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/products">
              <ShoppingBag className="h-4 w-4" /> Browse products
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
