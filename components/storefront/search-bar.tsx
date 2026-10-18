'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SearchBar({
  className,
  defaultValue = '',
  placeholder = 'Search products…',
  autoFocus = false,
}: {
  className?: string;
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(defaultValue);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const term = value.trim();
    router.push(term ? `/products?q=${encodeURIComponent(term)}` : '/products');
  }

  return (
    <form onSubmit={submit} role="search" className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        name="q"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label="Search products"
        className="h-10 w-full rounded-full border border-input bg-background pl-9 pr-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </form>
  );
}
