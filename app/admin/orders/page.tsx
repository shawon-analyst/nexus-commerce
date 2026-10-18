import type { Metadata } from 'next';
import { OrdersClient } from '@/components/admin/orders-client';
import { getAdminOrders } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Orders' };

export default async function AdminOrdersPage() {
  const orders = await getAdminOrders(300);

  return <OrdersClient initialOrders={orders} />;
}
