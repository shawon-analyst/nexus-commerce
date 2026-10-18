import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { SupportWidgets } from '@/components/layout/support-widgets';
import { getCategories } from '@/lib/queries';

// Live inventory + per-user cart state: never serve a cached shell here.
export const dynamic = 'force-dynamic';

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategories();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader categories={categories} />
      <main className="flex-1">{children}</main>
      <SiteFooter categories={categories} />
      <SupportWidgets />
    </div>
  );
}
