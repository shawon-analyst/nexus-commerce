import { NextResponse } from 'next/server';
import { getCurrentProfileResult, getOrderWithItems } from '@/lib/queries';
import { emailConfigured, sendEmail } from '@/lib/email/resend';
import { orderConfirmationEmail } from '@/lib/email/order-confirmation';
import { SUPPORT_EMAIL } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A confirmation only makes sense for an order placed just now. The window is
 * also what keeps a replayed request from mailing about ancient history.
 */
const FRESH_WINDOW_MS = 60 * 60 * 1000;

/**
 * Best-effort "your order is confirmed" e-mail.
 *
 * Called fire-and-forget by the checkout form the moment `place_order()`
 * resolves — **after** the transaction, never inside it. Nothing here can fail
 * an order: every outcome is a JSON result, and a missing mail provider answers
 * `MAIL_NOT_CONFIGURED` rather than an error.
 *
 * Ownership is decided by the database, not this route: the order is read with
 * the caller's own cookies, so RLS returns `null` for somebody else's id and the
 * response is the same 404 an unknown id gets — no existence leak. The explicit
 * `user_id` comparison is belt-and-braces on top of that.
 *
 * There is deliberately no send-once marker (that would need a column, a
 * migration and a guard change). The fresh window plus one call per checkout
 * covers the normal path; a client retry inside the hour could send twice.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ sent: false, error: 'INVALID_ORDER_ID' }, { status: 400 });
  }

  const result = await getCurrentProfileResult();
  if (result.status === 'anonymous') {
    return NextResponse.json({ sent: false, error: 'AUTH_REQUIRED' }, { status: 401 });
  }
  if (result.status === 'error') {
    console.error('[notify] profile lookup failed:', result.message);
    return NextResponse.json({ sent: false, error: 'PROFILE_UNAVAILABLE' }, { status: 503 });
  }

  const profile = result.profile;
  const order = await getOrderWithItems(params.id);
  if (!order || order.user_id !== profile.id) {
    return NextResponse.json({ sent: false, error: 'ORDER_NOT_FOUND' }, { status: 404 });
  }

  if (order.status === 'cancelled') {
    return NextResponse.json({ sent: false, skipped: 'ORDER_CANCELLED' });
  }

  const age = Date.now() - new Date(order.created_at).getTime();
  if (!Number.isFinite(age) || age > FRESH_WINDOW_MS) {
    return NextResponse.json({ sent: false, skipped: 'ORDER_NOT_RECENT' });
  }

  if (!emailConfigured()) {
    // The out-of-the-box state of a fresh clone: orders work, mail is off.
    return NextResponse.json({ sent: false, skipped: 'MAIL_NOT_CONFIGURED' });
  }

  const rendered = orderConfirmationEmail(order, { recipientName: profile.full_name });
  const send = await sendEmail({
    to: profile.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo: SUPPORT_EMAIL,
  });

  // 202 for "accepted, but the provider did not take it" — the client ignores
  // this either way, and the operator sees the real reason in the server log.
  return NextResponse.json(send, { status: send.sent ? 200 : 202 });
}
