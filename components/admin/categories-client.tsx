'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Save, Tags, Trash2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { SafeImage } from '@/components/ui/safe-image';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { refreshStorefront } from '@/lib/storefront-refresh';
import { humanizeError, slugify } from '@/lib/utils';
import type { Category } from '@/lib/types';

type Draft = { id?: string; name: string; slug: string; image_url: string };

const EMPTY: Draft = { name: '', slug: '', image_url: '' };

export function CategoriesClient({
  initialCategories,
  productCounts,
}: {
  initialCategories: Category[];
  productCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [categories, setCategories] = React.useState(initialCategories);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Category | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => setCategories(initialCategories), [initialCategories]);

  const isEdit = Boolean(draft?.id);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.name.trim()) return toast.error('A category name is required');

    const slug = (draft.slug.trim() || slugify(draft.name)).toLowerCase();
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const payload = {
        name: draft.name.trim(),
        slug,
        image_url: draft.image_url.trim() || null,
      };

      const { data, error } = isEdit
        ? await supabase
            .from('categories')
            .update(payload)
            .eq('id', draft.id!)
            .select('id')
            .maybeSingle()
        : await supabase.from('categories').insert(payload).select('id').maybeSingle();

      if (error) {
        toast.error(isEdit ? 'Could not update category' : 'Could not create category', {
          description: humanizeError(error),
        });
        return;
      }
      // RLS refuses writes silently (no error, no returned row).
      if (!data) {
        toast.error(isEdit ? 'Could not update category' : 'Could not create category', {
          description: 'The database refused the write — this account is not an admin.',
        });
        return;
      }

      toast.success(isEdit ? 'Category updated' : 'Category created', {
        description: `“${payload.name}” is available in the storefront filter.`,
      });
      await refreshStorefront(['categories']);
      setDraft(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('categories')
        .delete()
        .eq('id', deleteTarget.id)
        .select('id')
        .maybeSingle();

      if (error) {
        toast.error('Could not delete category', { description: humanizeError(error) });
        return;
      }
      if (!data) {
        toast.error('Could not delete category', {
          description: 'The database refused the delete — this account is not an admin.',
        });
        return;
      }

      toast.success('Category deleted', {
        description: 'Products kept their records and are now uncategorised.',
      });
      await refreshStorefront(['categories', 'products']);
      setDeleteTarget(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Group products so shoppers can filter instantly.
          </p>
        </div>
        <Button onClick={() => setDraft(EMPTY)}>
          <Plus className="h-4 w-4" /> Add category
        </Button>
      </header>

      <Card>
        <CardContent className="p-4">
          {categories.length === 0 ? (
            <EmptyState
              icon={Tags}
              title="No categories yet"
              description="Create your first category, then assign products to it."
              action={
                <Button onClick={() => setDraft(EMPTY)}>
                  <Plus className="h-4 w-4" /> Add category
                </Button>
              }
            />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <SafeImage
                            src={category.image_url}
                            alt={category.name}
                            wrapperClassName="h-10 w-10 shrink-0 rounded-md border"
                            sizes="40px"
                          />
                          <span className="text-sm font-medium">{category.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {category.slug}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="muted" className="font-normal">
                          {productCounts[category.id] ?? 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() =>
                              setDraft({
                                id: category.id,
                                name: category.name,
                                slug: category.slug,
                                image_url: category.image_url ?? '',
                              })
                            }
                            aria-label="Edit category"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(category)}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="Delete category"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit category' : 'New category'}</DialogTitle>
            <DialogDescription>
              The slug is used in the storefront URL: <code>/products?category=slug</code>.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">Name *</Label>
              <Input
                id="c-name"
                value={draft?.name ?? ''}
                onChange={(event) => {
                  const name = event.target.value;
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          name,
                          // keep the slug in sync until the user edits it manually
                          slug:
                            !prev.slug || prev.slug === slugify(prev.name)
                              ? slugify(name)
                              : prev.slug,
                        }
                      : prev,
                  );
                }}
                placeholder="Electronics"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="c-slug">Slug</Label>
              <Input
                id="c-slug"
                value={draft?.slug ?? ''}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, slug: slugify(event.target.value) } : prev))
                }
                placeholder="electronics"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="c-image">Image URL</Label>
              <Input
                id="c-image"
                value={draft?.image_url ?? ''}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, image_url: event.target.value } : prev))
                }
                placeholder="https://…"
              />
            </div>

            {draft?.image_url && (
              <SafeImage
                src={draft.image_url}
                alt="Preview"
                wrapperClassName="h-32 w-full rounded-lg border"
                sizes="480px"
              />
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{deleteTarget?.name}”?</DialogTitle>
            <DialogDescription>
              {productCounts[deleteTarget?.id ?? ''] ?? 0} product(s) will become uncategorised.
              No product is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Keep category
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
