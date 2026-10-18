/**
 * The scrolling ticker above the header.
 *
 * Only CSS drives it (no JS, no animation library): the wrapper paints a slow
 * drifting gradient, a light streak sweeps across on top, and the message list
 * scrolls via the `marquee` keyframes. The list is rendered twice — the second
 * copy is `aria-hidden` and exists purely so `translateX(-50%)` loops without a
 * visible seam.
 *
 * `prefers-reduced-motion` is honoured twice over: the CSS animations stop, and
 * the track keeps its static first frame.
 */

/**
 * The running business lines. The leading emoji is part of the copy and reads
 * as the bullet's icon, so no separate glyph is drawn beside it.
 */
const MESSAGES = [
  '🚚 CASH ON DELIVERY AVAILABLE ALL OVER BANGLADESH — FAST 24-48 HOUR DELIVERY!',
  '💳 BKASH & NAGAD PAYMENTS ACCEPTED WITH INSTANT CONFIRMATION',
  '💯 100% GENUINE PRODUCTS WITH 7-DAYS EASY REPLACEMENT GUARANTEE',
  '📞 NEED HELP ORDERING? CHAT WITH US ON WHATSAPP OR MESSENGER!',
] as const;

function TickerItem({ text, hidden = false }: { text: string; hidden?: boolean }) {
  return (
    <span
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center gap-2 whitespace-nowrap px-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90 sm:text-xs"
    >
      {text}
      <span aria-hidden className="ml-3 text-white/30">
        ◆
      </span>
    </span>
  );
}

export function AnnouncementBar() {
  return (
    <aside
      className="announcement-surface relative overflow-hidden text-white"
      aria-label="Store announcements"
    >
      {/* sweeping light streak */}
      <span
        aria-hidden
        className="announcement-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen motion-reduce:hidden"
      />

      {/* a whisper of glow so the flat gradient has depth */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_140%_at_0%_50%,rgba(139,92,246,0.30),transparent_55%)]"
      />

      <div className="relative flex py-2">
        <div className="flex w-max animate-marquee items-center motion-reduce:animate-none">
          {MESSAGES.map((message) => (
            <TickerItem key={message} text={message} />
          ))}
          {MESSAGES.map((message) => (
            <TickerItem key={`${message}-clone`} text={message} hidden />
          ))}
        </div>
      </div>

      <span aria-hidden className="announcement-edge absolute inset-x-0 bottom-0 h-px opacity-70" />
    </aside>
  );
}
