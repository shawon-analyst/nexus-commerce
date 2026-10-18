'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Boxes,
  ExternalLink,
  Eye,
  EyeOff,
  Minus,
  Package,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { SafeImage } from '@/components/ui/safe-image';
import { RealtimeDot } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProductFormDialog } from '@/components/admin/product-form-dialog';
import { useRealtimeProducts } from '@/hooks/use-realtime';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { refreshProductsAndStats } from '@/lib/storefront-refresh';
import { cn, formatCurrency, humanizeError, toNumber } from '@/lib/utils';
import type { Category, ProductWithCategory } from '@/lib/types';

type StockFilter = 'all' | 'low' | 'out' | 'in';

export function ProductsClient({
  initialProducts,
  categories,
}: {
  initialProducts: ProductWithCategory[];
  categories: Category[];
}) {
  const { products, status } = useRealtimeProducts(initialProducts);
  const [term, setTerm] = React.useState('');
  const [stockFilter, setStockFilter] = React.useState<StockFilter>('all');
  const [editing, setEditing] = React.useState<ProductWithCategory | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ProductWithCategory | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [busyStock, setBusyStock] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const needle = term.trim().toLowerCase();
    return products.filter((product) => {
      if (needle && !product.title.toLowerCase().includes(needle)) return false;
      const stock = toNumber(product.stock);
      if (stockFilter === 'out') return stock === 0;
      if (stockFilter === 'low') return stock > 0 && stock <= product.low_stock_threshold;
      if (stockFilter === 'in') return stock > 0;
      return true;
    });
  }, [products, stockFilter, term]);

  const counters = React.useMemo(() => {
    const low = products.filter(
      (p) => toNumber(p.stock) > 0 && toNumber(p.stock) <= p.low_stock_threshold,
    ).length;
    const out = products.filter((p) => toNumber(p.stock) === 0).length;
    return { total: products.length, low, out };
  }, [products]);

  /** Instant stock adjustment: +1 / -1 straight from the table. */
  async function adjustStock(product: ProductWithCategory, delta: number) {
    const next = Math.max(toNumber(product.stock) + delta, 0);
    setBusyStock(product.id);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('products')
        .update({ stock: next })
        .eq('id', product.id)
        .select('id')
        .maybeSingle();

      if (error) {
        toast.error('Could not update stock', { description: humanizeError(error) });
        return;
      }
      // RLS blocks writes silently: no error, no row returned. Never report
      // success for a write the database refused.
      if (!data) {
        toast.error('Could not update stock', {
          description: 'The database refused the update — this account is not an admin.',
        });
        return;
      }
      toast.success(`${product.title}: ${next} in stock`);
      // the storefront grid is cached — drop it so the new count is instant
      await refreshProductsAndStats();
    } finally {
      setBusyStock(null);
    }
  }

  async function toggleActive(product: ProductWithCategory) {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id)
      .select('id')
      .maybeSingle();

    if (error) {
      toast.error('Could not update visibility', { description: humanizeError(error) });
      return;
    }
    if (!data) {
      toast.error('Could not update visibility', {
        description: 'The database refused the update — this account is not an admin.',
      });
      return;
    }
    toast.success(product.is_active ? 'Hidden from storefront' : 'Now visible on storefront');
    await refreshProductsAndStats();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('products')
        .delete()
        .eq('id', deleteTarget.id)
        .select('id')
        .maybeSingle();

      if (error) {
        toast.error('Could not delete product', { description: humanizeError(error) });
        return;
      }
      if (!data) {
        toast.error('Could not delete product', {
          description: 'The database refused the delete — this account is not an admin.',
        });
        return;
      }

      toast.success('Product deleted', {
        description: 'Past orders keep their historical line items.',
      });
      await refreshProductsAndStats();
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const FILTERS: Array<{ value: StockFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: counters.total },
    { value: 'in', label: 'In stock', count: counters.total - counters.out },
    { value: 'low', label: 'Low stock', count: counters.low },
    { value: 'out', label: 'Out of stock', count: counters.out },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Products</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <RealtimeDot status={status} />
            <span>
              {counters.total} products · {counters.low} low · {counters.out} out of stock
            </span>
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add product
        </Button>
      </header>

      {(counters.low > 0 || counters.out > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-900">
            <strong>{counters.out}</strong> product(s) are out of stock and{' '}
            <strong>{counters.low}</strong> are running low. Use the +/− controls to top up
            inventory instantly.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStockFilter(option.value)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    stockFilter === option.value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {option.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                      stockFilter === option.value ? 'bg-primary-foreground/20' : 'bg-muted',
                    )}
                  >
                    {option.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="Search products…"
                className="pl-9"
              />
            </div>
          </div>

          <Separator />

          {filtered.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={products.length === 0 ? 'No products yet' : 'Nothing matches'}
              description={
                products.length === 0
                  ? 'Add your first product — it will appear on the storefront immediately.'
                  : 'Try a different search term or stock filter.'
              }
              action={
                products.length === 0 ? (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add product
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="hidden sm:table-cell">Category</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="hidden md:table-cell">Flags</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((product) => {
                    const stock = toNumber(product.stock);
                    const isLow = stock > 0 && stock <= product.low_stock_threshold;
                    return (
                      <TableRow key={product.id} className="animate-fade-in">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <SafeImage
                              src={product.image_url}
                              alt={product.title}
                              wrapperClassName="h-11 w-11 shrink-0 rounded-md border"
                              sizes="44px"
                            />
                            <div className="min-w-0">
                              <p className="line-clamp-1 text-sm font-medium">{product.title}</p>
                              <p className="font-mono text-[11px] text-muted-foreground">
                                {product.id.slice(0, 8)}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="hidden sm:table-cell">
                          <span className="text-sm text-muted-foreground">
                            {product.categories?.name ?? '—'}
                          </span>
                        </TableCell>

                        <TableCell>
                          <span className="text-sm font-semibold tabular-nums">
                            {formatCurrency(product.price)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="icon-sm"
                              variant="outline"
                              disabled={busyStock === product.id || stock === 0}
                              onClick={() => void adjustStock(product, -1)}
                              aria-label="Decrease stock"
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span
                              className={cn(
                                'w-10 text-center text-sm font-semibold tabular-nums',
                                stock === 0 && 'text-destructive',
                                isLow && 'text-amber-600',
                              )}
                            >
                              {stock}
                            </span>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              disabled={busyStock === product.id}
                              onClick={() => void adjustStock(product, 1)}
                              aria-label="Increase stock"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          {(isLow || stock === 0) && (
                            <p
                              className={cn(
                                'mt-1 text-[11px] font-medium',
                                stock === 0 ? 'text-destructive' : 'text-amber-600',
                              )}
                            >
                              {stock === 0 ? 'Out of stock' : `Low · alert at ${product.low_stock_threshold}`}
                            </p>
                          )}
                        </TableCell>

                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {product.featured && (
                              <Badge variant="info" className="font-normal">
                                <Star className="h-3 w-3" /> Featured
                              </Badge>
                            )}
                            <Badge
                              variant={product.is_active ? 'success' : 'muted'}
                              className="font-normal"
                            >
                              {product.is_active ? 'Active' : 'Hidden'}
                            </Badge>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              asChild
                              title="Open on storefront"
                            >
                              <Link href={`/products/${product.id}`} target="_blank">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => void toggleActive(product)}
                              title={product.is_active ? 'Hide from storefront' : 'Show on storefront'}
                            >
                              {product.is_active ? (
                                <Eye className="h-3.5 w-3.5" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => {
                                setEditing(product);
                                setFormOpen(true);
                              }}
                              title="Edit product"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              onClick={() => setDeleteTarget(product)}
                              className="text-muted-foreground hover:text-destructive"
                              title="Delete product"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ProductFormDialog
        product={editing}
        categories={categories}
        open={formOpen}
        onOpenChange={setFormOpen}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.title}”?</DialogTitle>
            <DialogDescription>
              This removes the product from the storefront. Historical order lines are preserved,
              and stock records for completed orders are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Keep product
            </Button>
            <Button variant="destructive" loading={deleting} onClick={() => void confirmDelete()}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProductStatsHint() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Boxes className="h-3.5 w-3.5" /> Inventory syncs live
      <Package className="h-3.5 w-3.5" />
    </span>
  );
}
