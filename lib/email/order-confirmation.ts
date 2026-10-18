import type { OrderWithItems } from '@/lib/types';
import { SITE_NAME, SITE_TAGLINE, absoluteUrl } from '@/lib/seo';
import {
  PAYMENT_METHOD_META,
  SHOP_ADDRESS,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  deliveryAreaMeta,
  formatCurrency,
  formatDateTime,
  paymentStatusMeta,
  toNumber,
} from '@/lib/utils';

/** `#A1B2C3D4` — the same short form the order pages display. */
export function orderNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

/**
 * Order fields are customer-supplied (product titles come from staff, but the
 * name, address, phone and notes are typed by the shopper) — so nothing touches
 * the HTML without passing through here first.
 */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Builds the confirmation e-mail for a placed order. Pure — no network, no
 * database — so it can be rendered in a test or a preview without sending.
 *
 * The money split mirrors `components/storefront/order-card.tsx`: `total_amount`
 * covers goods *and* delivery, so the goods line is the total minus the fee.
 * Legacy rows written before `0011` carry `shipping_fee = 0`, which is correct
 * for them.
 */
export function orderConfirmationEmail(
  order: OrderWithItems,
  options: { recipientName?: string | null } = {},
): RenderedEmail {
  const items = order.order_items ?? [];
  const shippingFee = toNumber(order.shipping_fee);
  const total = toNumber(order.total_amount);
  const goods = Math.max(total - shippingFee, 0);
  const unitCount = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);

  const number = orderNumber(order.id);
  const orderUrl = absoluteUrl(`/orders/${order.id}`);
  const placedAt = formatDateTime(order.created_at);
  const name = options.recipientName?.trim() || order.customer_name?.trim() || 'there';
  const payment = PAYMENT_METHOD_META[order.payment_method];
  const paymentStatus = paymentStatusMeta(order.payment_status);
  const isBkash = order.payment_method === 'bkash';

  const subject = `Your ${SITE_NAME} order ${number} is confirmed`;

  const nextStep = isBkash
    ? `We are verifying your bKash transfer${
        order.transaction_id ? ` (TrxID ${esc(order.transaction_id)})` : ''
      }. Your order moves to <strong>processing</strong> as soon as it matches.`
    : `Keep ${formatCurrency(total)} ready — the courier collects it when the parcel arrives.`;

  const itemRows = items
    .map(
      (item) => `
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #eef2f7;font-size:14px;color:#0f172a;">
                  ${esc(item.product_title || 'Product')}
                  <div style="color:#64748b;font-size:12px;margin-top:2px;">
                    ${esc(item.quantity)} × ${formatCurrency(item.unit_price)}
                  </div>
                </td>
                <td align="right" style="padding:10px 0;border-bottom:1px solid #eef2f7;font-size:14px;color:#0f172a;white-space:nowrap;">
                  ${formatCurrency(toNumber(item.unit_price) * toNumber(item.quantity))}
                </td>
              </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f5f7;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      Order ${esc(number)} · ${formatCurrency(total)} · ${esc(
        order.payment_method === 'cod' ? 'cash on delivery' : 'bKash',
      )} — thanks for shopping with ${esc(SITE_NAME)}.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #e6eaf1;font-family:${FONT};">

            <tr>
              <td style="padding:26px 32px;background:#0b1120;border-radius:13px 13px 0 0;">
                <div style="font-size:19px;font-weight:700;color:#ffffff;letter-spacing:.2px;">${esc(
                  SITE_NAME,
                )}</div>
                <div style="font-size:13px;color:#c7d2fe;margin-top:4px;">${esc(SITE_TAGLINE)}</div>
              </td>
            </tr>

            <tr>
              <td style="padding:30px 32px 0;">
                <h1 style="margin:0 0 6px;font-size:21px;line-height:1.3;color:#0f172a;">
                  Thanks, ${esc(name)} — your order is confirmed
                </h1>
                <p style="margin:0 0 4px;color:#475569;font-size:14px;">
                  Order <strong style="color:#0f172a;">${esc(number)}</strong> · placed ${esc(placedAt)}
                </p>
                <p style="margin:14px 0 0;color:#475569;font-size:14px;line-height:1.5;">${nextStep}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;">
                      Your items
                    </td>
                    <td align="right" style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#94a3b8;padding-bottom:6px;">
                      ${esc(unitCount)} item${unitCount === 1 ? '' : 's'}
                    </td>
                  </tr>
                  ${itemRows}
                  <tr>
                    <td style="padding:12px 0 0;font-size:14px;color:#64748b;">Items</td>
                    <td align="right" style="padding:12px 0 0;font-size:14px;color:#0f172a;white-space:nowrap;">
                      ${formatCurrency(goods)}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0 0;font-size:14px;color:#64748b;">Delivery (${esc(
                      deliveryAreaMeta(order.delivery_area).short,
                    )})</td>
                    <td align="right" style="padding:6px 0 0;font-size:14px;color:#0f172a;white-space:nowrap;">
                      ${shippingFee > 0 ? formatCurrency(shippingFee) : 'Free'}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#0f172a;border-top:1px solid #e2e8f0;">
                      Total${order.payment_method === 'cod' ? ' (due on delivery)' : ' paid'}
                    </td>
                    <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;color:#0f172a;white-space:nowrap;border-top:1px solid #e2e8f0;">
                      ${formatCurrency(total)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e6eaf1;border-radius:10px;">
                  <tr>
                    <td style="padding:16px 18px;font-size:13px;color:#475569;line-height:1.6;">
                      <strong style="color:#0f172a;">Payment.</strong>
                      ${esc(payment?.label ?? order.payment_method)} — ${esc(paymentStatus.label)}${
                        order.transaction_id ? ` · TrxID ${esc(order.transaction_id)}` : ''
                      }
                      <br />
                      <strong style="color:#0f172a;">Delivering to.</strong>
                      ${esc(order.customer_name)} · ${esc(order.phone)}
                      <br />
                      ${esc(order.shipping_address).replace(/\n/g, '<br />')}
                      ${
                        order.notes
                          ? `<br /><strong style="color:#0f172a;">Your note.</strong> ${esc(order.notes)}`
                          : ''
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:24px 32px 4px;">
                <a href="${esc(orderUrl)}"
                   style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">
                  Track this order
                </a>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 32px 30px;border-top:1px solid #eef2f7;margin-top:20px;">
                <p style="margin:0 0 6px;font-size:12px;color:#64748b;line-height:1.6;">
                  Questions about this order? Reply to this e-mail, call
                  <a href="tel:${esc(SUPPORT_PHONE)}" style="color:#4f46e5;text-decoration:none;">${esc(
                    SUPPORT_PHONE,
                  )}</a>,
                  or write to
                  <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:#4f46e5;text-decoration:none;">${esc(
                    SUPPORT_EMAIL,
                  )}</a>.
                </p>
                <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.6;">
                  ${esc(SITE_NAME)} · ${esc(SHOP_ADDRESS)}
                  <br />
                  You received this because an order was placed with this address.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${SITE_NAME} — order ${number} confirmed`,
    '',
    `Thanks, ${name}.`,
    `Placed ${placedAt}`,
    '',
    'Your items',
    ...items.map(
      (item) =>
        `- ${item.product_title || 'Product'} x${item.quantity} @ ${formatCurrency(
          item.unit_price,
        )} = ${formatCurrency(toNumber(item.unit_price) * toNumber(item.quantity))}`,
    ),
    '',
    `Items:    ${formatCurrency(goods)}`,
    `Delivery (${deliveryAreaMeta(order.delivery_area).short}): ${
      shippingFee > 0 ? formatCurrency(shippingFee) : 'Free'
    }`,
    `Total:    ${formatCurrency(total)}${order.payment_method === 'cod' ? ' (due on delivery)' : ''}`,
    '',
    `Payment:  ${payment?.label ?? order.payment_method} — ${paymentStatus.label}${
      order.transaction_id ? ` (TrxID ${order.transaction_id})` : ''
    }`,
    `Deliver to: ${order.customer_name}, ${order.phone}`,
    order.shipping_address,
    ...(order.notes ? ['', `Your note: ${order.notes}`] : []),
    '',
    `Track this order: ${orderUrl}`,
    '',
    `Questions? Call ${SUPPORT_PHONE} or e-mail ${SUPPORT_EMAIL}.`,
    `${SITE_NAME} · ${SHOP_ADDRESS}`,
  ].join('\n');

  return { subject, html, text };
}
