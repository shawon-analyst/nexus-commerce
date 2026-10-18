'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn, initials } from '@/lib/utils';

type UserAvatarProps = {
  /** OAuth picture or Supabase Storage public URL. Missing/broken → initials. */
  src?: string | null;
  name?: string | null;
  email?: string | null;
  alt?: string;
  /**
   * Rendered size hint used by `next/image` (`sizes` attribute). The visual
   * size comes from `className`, which defaults to the header button's 36px.
   */
  sizes?: string;
  className?: string;
};

/**
 * Round profile picture with a graceful fallback.
 *
 * Two layout guarantees, both of which matter because the same component is
 * dropped into the header button, the mobile drawer, a table row and the
 * account card:
 *
 *  1. **The box is fixed and self-contained.** `h-9 w-9` (or the caller's
 *     override) plus `shrink-0` and `overflow-hidden` mean no avatar can ever
 *     resize, squash, or nudge its neighbours — not while the picture is
 *     loading, not when it 404s, and not when the initials swap in.
 *  2. **It is `flex`, not `inline-flex`.** An inline-level box sits on a line
 *     box, so the parent's font size and line height silently added a few
 *     pixels of descender space beneath it. That is what made the header avatar
 *     look off-centre and appear to jump when its wrapper was animated.
 *
 * The initials are painted on *every* render and simply stay behind the image,
 * so a slow picture fades in over an already-correct badge instead of flashing
 * an empty circle, and a broken URL needs no state change to look right.
 */
export function UserAvatar({
  src,
  name,
  email,
  alt,
  sizes = '40px',
  className,
}: UserAvatarProps) {
  const [failed, setFailed] = React.useState(false);

  // Re-arm the fallback if the source changes (new upload, different account).
  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  const label = name?.trim() || email?.trim() || 'Account';
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={cn(
        'relative flex h-9 w-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        'bg-gradient-to-br from-primary via-primary to-primary/75 font-bold uppercase leading-none text-primary-foreground',
        'text-[0.7rem] ring-1 ring-inset ring-white/15 dark:ring-white/10',
        className,
      )}
    >
      {/* Always present, never in flow: the fallback layer. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        {initials(name, email)}
      </span>
      {showImage && (
        <Image
          src={src as string}
          alt={alt ?? `${label} profile picture`}
          fill
          sizes={sizes}
          draggable={false}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
