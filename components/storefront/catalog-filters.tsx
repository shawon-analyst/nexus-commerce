'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CategoryPill } from '@/components/storefront/category-pill';
import type { Category } from '@/lib/types';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest arrivals' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name: A–Z' },
];

export function CatalogFilters({
  categories,
  resultCount,
}: {
  categories: Category[];
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const activeCategory = searchParams.get('category') ?? 'all';
  const activeSort = searchParams.get('sort') ?? 'newest';
  const inStockOnly = searchParams.get('inStock') === '1';
  const urlSearch = searchParams.get('q') ?? '';
  const [term, setTerm] = React.useState(urlSearch);

  React.useEffect(() => {
    setTerm(urlSearch);
  }, [urlSearch]);

  const push = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value === '' || value === 'all') next.delete(key);
        else next.set(key, value);
      });
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // debounced search
  React.useEffect(() => {
    if (term === urlSearch) return;
    const id = window.setTimeout(() => push({ q: term.trim() || null }), 350);
    return () => window.clearTimeout(id);
  }, [term, urlSearch, push]);

  const hasFilters =
    activeCategory !== 'all' || activeSort !== 'newest' || inStockOnly || urlSearch !== '';

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search products…"
            aria-label="Search products"
            className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {term && (
            <button
              type="button"
              onClick={() => setTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:w-auto">
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={activeSort} onValueChange={(value) => push({ sort: value })}>
              <SelectTrigger className="h-10 w-full sm:w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) => push({ inStock: event.target.checked ? '1' : null })}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            In stock only
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        <CategoryPill
          name="All Products"
          slug="all"
          active={activeCategory === 'all'}
          onClick={() => push({ category: null })}
        />
        {categories.map((category) => (
          <CategoryPill
            key={category.id}
            name={category.name}
            slug={category.slug}
            active={activeCategory === category.slug}
            onClick={() => push({ category: category.slug })}
          />
        ))}

        <div className="flex w-full items-center justify-end gap-3 sm:ml-auto sm:w-auto">
          {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Badge variant="muted" className="font-normal">
            {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </Badge>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => startTransition(() => router.push(pathname, { scroll: false }))}
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
