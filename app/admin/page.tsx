import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Settings, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DashboardClient } from '@/components/admin/dashboard-client';
import { getAdminOrders, getAdminStats } from '@/lib/queries';
import type { DashboardStats } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Dashboard' };

const EMPTY_STATS: DashboardStats = {
  total_revenue: 0,
  revenue_30d: 0,
  total_orders: 0,
  pending_orders: 0,
  active_orders: 0,
  delivered_orders: 0,
  cancelled_orders: 0,
  total_products: 0,
  out_of_stock: 0,
  low_stock_count: 0,
  total_customers: 0,
  low_stock_products: [],
  revenue_by_day: [],
};

/** Shared shell for the three "the dashboard cannot work yet" states. */
function DashboardProblem({
  title,
  description,
  detail,
  tone,
}: {
  title: string;
  description: React.ReactNode;
  detail?: string;
  tone: 'warning' | 'danger';
}) {
  const Icon = tone === 'danger' ? ShieldAlert : AlertTriangle;
  return (
    <div className="mx-auto max-w-lg rounded-xl border bg-card p-8 text-center">
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
          tone === 'danger' ? 'bg-destructive/10' : 'bg-amber-50'
        }`}
      >
        <Icon
          className={`h-6 w-6 ${tone === 'danger' ? 'text-destructive' : 'text-amber-600'}`}
        />
      </div>
      <h1 className="mt-5 text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {detail && (
        <pre className="mt-4 overflow-x-auto rounded-lg border bg-muted p-3 text-left text-xs">
          {detail}
        </pre>
      )}
      <Button asChild className="mt-6">
        <Link href="/admin/products">
          <Settings className="h-4 w-4" /> Go to products
        </Link>
      </Button>
    </div>
  );
}

/** Turns a `?error=` redirect from the middleware/layout into a readable line. */
function adminNotice(code?: string) {
  switch (code) {
    case 'admin-only':
      return 'That area is administrator-only. Operators run orders, products, categories and stock.';
    case 'account-disabled':
      return 'This account has been blocked. Ask an administrator to unblock it.';
    default:
      return null;
  }
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: { error?: string | string[] };
}) {
  const [statsResult, orders] = await Promise.all([getAdminStats(), getAdminOrders(20)]);

  const rawError = searchParams?.error;
  const notice = adminNotice(Array.isArray(rawError) ? rawError[0] : rawError);

  if (!statsResult.ok) {
    if (statsResult.kind === 'not_authorized') {
      return (
        <DashboardProblem
          tone="danger"
          title="Not recognised as an administrator"
          description={
            <>
              The database rejected <code>admin_dashboard_stats()</code> for this account. Confirm
              your row in <code>public.profiles</code> has <code>role = &apos;admin&apos;</code>, then
              reload — or apply <code>0008</code>/<code>0009</code>, which let operators open the
              console as well.
            </>
          }
          detail={statsResult.message}
        />
      );
    }

    if (statsResult.kind === 'missing_function') {
      return (
        <DashboardProblem
          tone="warning"
          title="Database not initialised"
          description={
            <>
              The <code>admin_dashboard_stats</code> function could not be found. Run{' '}
              <code>supabase/migrations/0001_init.sql</code> in the Supabase SQL editor, then reload
              this page.
            </>
          }
          detail={statsResult.message}
        />
      );
    }

    return (
      <DashboardProblem
        tone="danger"
        title="The dashboard could not load"
        description="The database returned an unexpected error while building the dashboard."
        detail={statsResult.message}
      />
    );
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{notice}</p>
        </div>
      )}
      <DashboardClient
        initialStats={{ ...EMPTY_STATS, ...statsResult.stats }}
        initialOrders={orders}
      />
    </div>
  );
}
