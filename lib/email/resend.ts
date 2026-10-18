import { Resend } from 'resend';

/**
 * Fail-soft transactional e-mail transport.
 *
 * The shop has to keep taking orders whether or not mail is configured, so a
 * missing or broken provider resolves to a *result object* rather than a throw.
 * Callers never branch on "is there a mail server", and a checkout can never
 * fail because of one.
 *
 * Both variables are server-side only — never prefix them with `NEXT_PUBLIC_`.
 *   RESEND_API_KEY    the provider key
 *   ORDER_FROM_EMAIL  the From: address, on a domain verified in Resend
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { sent: true; id: string | null }
  | { sent: false; skipped: string }
  | { sent: false; error: string };

/** True when both variables are present, so the UI can advertise the feature. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.ORDER_FROM_EMAIL);
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_FROM_EMAIL;

  // Not an error: this is the out-of-the-box state of a fresh clone.
  if (!apiKey) return { sent: false, skipped: 'RESEND_API_KEY is not set' };
  if (!from) return { sent: false, skipped: 'ORDER_FROM_EMAIL is not set' };

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      const message = 'message' in error && error.message ? error.message : 'send rejected';
      console.error('[email] provider rejected the message:', message);
      return { sent: false, error: message };
    }

    return { sent: true, id: data?.id ?? null };
  } catch (cause) {
    // Network/DNS/timeout. Logged for the operator, never surfaced to a shopper.
    const message = cause instanceof Error ? cause.message : 'unknown transport error';
    console.error('[email] transport failed:', message);
    return { sent: false, error: message };
  }
}
