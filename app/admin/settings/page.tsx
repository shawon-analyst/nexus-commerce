import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SettingsForm } from '@/components/admin/settings-form';
import { getCurrentProfileResult, getSiteSettings } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings' };

/**
 * `/admin/settings` — delivery fees, the bKash wallet and the announcement bar.
 *
 * Administrator-only, and deliberately not merely "staff": these are prices and
 * shop-wide copy, so an operator is sent back to the dashboard. The API route
 * checks `is_admin()` again and the table's RLS policy enforces it a third time,
 * which is what stops a hand-rolled request.
 *
 * The settings are read through `getSiteSettings()`, i.e. the same cached row the
 * storefront uses, so the form always opens on what shoppers are actually being
 * charged.
 */
export default async function AdminSettingsPage() {
  const result = await getCurrentProfileResult();

  if (result.status === 'anonymous') redirect('/login?redirectTo=/admin/settings');
  if (result.status === 'error') redirect('/admin');

  if (result.profile.role !== 'admin') redirect('/admin?error=admin-only');

  const settings = await getSiteSettings();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Store settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Delivery charges, the bKash wallet and the announcement bar. Changes are live on the
          storefront as soon as you save — the checkout, the cart and the ticker all read the same
          row.
        </p>
      </div>

      <SettingsForm initialSettings={settings} />
    </div>
  );
}
