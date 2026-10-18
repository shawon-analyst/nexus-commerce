'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Loader2, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SafeImage } from '@/components/ui/safe-image';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { refreshStorefront } from '@/lib/storefront-refresh';
import { humanizeError, toNumber } from '@/lib/utils';
import type { Category, ProductWithCategory } from '@/lib/types';

type FormState = {
  title: string;
  description: string;
  price: string;
  stock: string;
  category_id: string;
  image_url: string;
  featured: boolean;
  low_stock_threshold: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  title: '',
  description: '',
  price: '',
  stock: '0',
  category_id: 'none',
  image_url: '',
  featured: false,
  low_stock_threshold: '5',
  is_active: true,
};

export function ProductFormDialog({
  product,
  categories,
  open,
  onOpenChange,
  onSaved,
}: {
  product: ProductWithCategory | null;
  categories: Category[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isEdit = Boolean(product);

  // reset the form every time the dialog opens (or the target product changes)
  React.useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        title: product.title,
        description: product.description ?? '',
        price: String(toNumber(product.price)),
        stock: String(toNumber(product.stock)),
        category_id: product.category_id ?? 'none',
        image_url: product.image_url ?? '',
        featured: product.featured,
        low_stock_threshold: String(product.low_stock_threshold ?? 5),
        is_active: product.is_active,
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, product]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${crypto.randomUUID()}.${extension}`;

      const { error } = await supabase.storage
        .from('product-images')
        .upload(path, file, { cacheControl: '31536000', upsert: false });

      if (error) {
        toast.error('Upload failed', {
          description: `${humanizeError(error)} — you can paste an image URL instead.`,
        });
        return;
      }

      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      set('image_url', data.publicUrl);
      toast.success('Image uploaded');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();

    if (!form.title.trim()) return toast.error('A product title is required');
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) return toast.error('Enter a valid price');
    const stock = Number(form.stock);
    if (!Number.isInteger(stock) || stock < 0) return toast.error('Stock must be a whole number');

    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        price,
        stock,
        category_id: form.category_id === 'none' ? null : form.category_id,
        image_url: form.image_url.trim() || null,
        featured: form.featured,
        low_stock_threshold: Number(form.low_stock_threshold) || 5,
        is_active: form.is_active,
      };

      const { data, error } = isEdit
        ? await supabase
            .from('products')
            .update(payload)
            .eq('id', product!.id)
            .select('id')
            .maybeSingle()
        : await supabase.from('products').insert(payload).select('id').maybeSingle();

      if (error) {
        toast.error(isEdit ? 'Could not update product' : 'Could not create product', {
          description: humanizeError(error),
        });
        return;
      }
      // RLS refuses writes silently (no error, no returned row).
      if (!data) {
        toast.error(isEdit ? 'Could not update product' : 'Could not create product', {
          description: 'The database refused the write — this account is not an admin.',
        });
        return;
      }

      toast.success(isEdit ? 'Product updated' : 'Product created', {
        description: `${payload.title} is live on the storefront.`,
      });
      // bust the cached storefront catalogue so the change is visible at once
      await refreshStorefront(['products', 'categories']);
      onOpenChange(false);
      onSaved?.();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit product' : 'Add new product'}</DialogTitle>
          <DialogDescription>
            Changes go live instantly — the storefront and live stock counters pick them up over
            websockets.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="grid gap-1.5">
              <Label htmlFor="p-title">Title *</Label>
              <Input
                id="p-title"
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder="Aurora Wireless Headphones"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Preview</Label>
              <SafeImage
                src={form.image_url}
                alt="Preview"
                wrapperClassName="h-[38px] w-full rounded-md border"
                sizes="180px"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="p-description">Description</Label>
            <Textarea
              id="p-description"
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="What makes this product great?"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-price">Price (৳ BDT) *</Label>
              <Input
                id="p-price"
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(event) => set('price', event.target.value)}
                placeholder="1200"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="p-stock">Stock *</Label>
              <Input
                id="p-stock"
                type="number"
                min="0"
                step="1"
                value={form.stock}
                onChange={(event) => set('stock', event.target.value)}
                placeholder="20"
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="p-threshold">Low stock alert at</Label>
              <Input
                id="p-threshold"
                type="number"
                min="0"
                step="1"
                value={form.low_stock_threshold}
                onChange={(event) => set('low_stock_threshold', event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(value) => set('category_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Uncategorised" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="p-image">Image URL</Label>
              <div className="flex gap-2">
                <Input
                  id="p-image"
                  value={form.image_url}
                  onChange={(event) => set('image_url', event.target.value)}
                  placeholder="https://…"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadImage(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload an image file"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                </Button>
                {form.image_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => set('image_url', '')}
                    title="Remove image"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Paste a link or upload a file to the <code>product-images</code> bucket.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-6 rounded-lg border bg-muted/30 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(event) => set('featured', event.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <ImagePlus className="h-4 w-4 text-muted-foreground" /> Feature on homepage
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => set('is_active', event.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Visible on storefront
            </label>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <Save className="h-4 w-4" /> {isEdit ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
