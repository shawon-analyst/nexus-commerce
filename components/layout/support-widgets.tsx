'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/*  Channels                                                                   */
/* -------------------------------------------------------------------------- */

/** Pre-filled greeting so the first message is never an awkward "hi". */
export const WHATSAPP_NUMBER = '8801934100750';
export const WHATSAPP_MESSAGE = 'Hello! I have a question about a product.';
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  WHATSAPP_MESSAGE,
)}`;

/**
 * Facebook Messenger.
 *
 * The link is the **profile** URL, not `m.me/<handle>`: the short form only
 * resolves a registered Messenger *username*, and this account has a profile
 * vanity name instead, so `m.me` lands on an error page. `facebook.com/<vanity>`
 * always resolves, and `target="_blank"` + `rel="noopener noreferrer"` on the
 * anchor keep the destination exactly as written below — no referrer is sent and
 * no redirect parameters are appended to it.
 */
export const MESSENGER_HANDLE = 'md.shawon.982336';
export const MESSENGER_LINK = `https://www.facebook.com/${MESSENGER_HANDLE}`;

/**
 * Where the bubbles make no sense: the staff console (they are running the shop,
 * not asking about it) and the checkout flow (nothing should float over a form
 * the shopper is trying to finish). Matched on the segment boundary so
 * `/checkout-thanks` would not be caught by `/checkout`.
 */
const HIDDEN_PREFIXES = ['/admin', '/checkout'];

type Channel = {
  key: string;
  href: string;
  /** Screen-reader label — the glyph carries no text. */
  aria: string;
  tooltip: string;
  /** Bubble fill, glow and focus ring. */
  bubble: string;
  halo: string;
  glyph: React.ComponentType<{ className?: string }>;
  /** Gentle offset so the two bubbles do not bob in lockstep. */
  delay?: string;
};

/** Brand glyph — lucide dropped its brand icons, so these are inlined. */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

function MessengerGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 0C5.373 0 0 4.974 0 11.111c0 3.498 1.744 6.614 4.469 8.652V24l4.088-2.242c1.092.301 2.246.464 3.443.464 6.627 0 12-4.975 12-11.111C24 4.974 18.627 0 12 0Zm1.191 14.963-3.055-3.26-5.963 3.26L10.732 8l3.131 3.26L19.752 8l-6.561 6.963Z" />
    </svg>
  );
}

/**
 * Order matters: the list is a column anchored to the bottom-right, so the *last*
 * entry sits in the corner. WhatsApp keeps the spot it has always had.
 */
const CHANNELS: Channel[] = [
  {
    key: 'messenger',
    href: MESSENGER_LINK,
    aria: 'Need help? Chat with us on Facebook Messenger',
    tooltip: 'Chat on Messenger',
    bubble:
      'bg-gradient-to-br from-[#00B2FF] to-[#006AFF] shadow-[#0084FF]/40 focus-visible:ring-[#0084FF]',
    halo: 'bg-[#0084FF]',
    glyph: MessengerGlyph,
    delay: '[animation-delay:700ms]',
  },
  {
    key: 'whatsapp',
    href: WHATSAPP_LINK,
    aria: 'Need help? Chat with us on WhatsApp',
    tooltip: 'Chat on WhatsApp',
    bubble: 'bg-[#25D366] shadow-[#25D366]/40 focus-visible:ring-[#25D366]',
    halo: 'bg-[#25D366]',
    glyph: WhatsAppGlyph,
  },
];

/* -------------------------------------------------------------------------- */
/*  Widget                                                                     */
/* -------------------------------------------------------------------------- */

function SupportBubble({
  channel,
  hovered,
  onHover,
}: {
  channel: Channel;
  hovered: boolean;
  onHover: (key: string | null) => void;
}) {
  const Glyph = channel.glyph;

  return (
    <a
      href={channel.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={channel.aria}
      onMouseEnter={() => onHover(channel.key)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(channel.key)}
      onBlur={() => onHover(null)}
      className={cn(
        'group relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl ring-1 ring-black/5 transition-transform duration-300 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 motion-safe:animate-float',
        channel.bubble,
        channel.delay,
      )}
    >
      {/* expanding halo */}
      <span
        aria-hidden
        className={cn(
          'absolute inset-0 rounded-full opacity-60 motion-safe:animate-glow-ring',
          channel.halo,
        )}
      />

      <Glyph className="relative h-7 w-7 drop-shadow-sm" />

      {/* tooltip */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-xl border border-border/70 bg-popover px-3 py-1.5 text-xs font-semibold text-popover-foreground shadow-lg transition-all duration-200 sm:block',
          hovered ? 'translate-x-0 opacity-100' : 'translate-x-1 opacity-0',
        )}
      >
        {channel.tooltip}
      </span>
    </a>
  );
}

/**
 * Sticky support bubbles (WhatsApp + Messenger).
 *
 * Pure CSS motion: a slow bob plus an expanding halo, so they catch the eye
 * without animating a layout property. Both are disabled under
 * `prefers-reduced-motion`, and the widget is hidden when printing. It sits below
 * the Radix dialog layer (z-50) so modals always win, and it is deliberately
 * absent from `/admin` and `/checkout` — see `HIDDEN_PREFIXES`.
 */
export function SupportWidgets() {
  const pathname = usePathname();
  const [hovered, setHovered] = React.useState<string | null>(null);

  const hidden =
    !!pathname &&
    HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  // Hooks run before this early return on purpose — the pathname is known during
  // SSR too, so there is no flash of a bubble on /checkout.
  if (hidden) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 print:hidden">
      {CHANNELS.map((channel) => (
        <SupportBubble
          key={channel.key}
          channel={channel}
          hovered={hovered === channel.key}
          onHover={setHovered}
        />
      ))}
    </div>
  );
}
