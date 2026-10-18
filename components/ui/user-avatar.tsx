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
  /** Draw an initials badge instead of the image (used while uploading). */
  forceInitials?: boolean;
};

/**
 * Round profile picture with a graceful fallback.
 *
 * The image is a plain `next/image` fill inside a fixed-size circle; if the URL
 * is missing *or* the request fails we swap to the initials badge. Broken avatar
 * links are the norm, not the exception (OAuth providers rotate them), so this
 * never lets the header render an empty hole.
 */
export function UserAvatar({
  src,
  name,
  email,
  alt,
  sizes = '40px',
  className,
  forceInitials = false,
}: UserAvatarProps) {
  const [failed, setFailed] = React.useState(false);

  // Re-arm the fallback if the source changes (new upload, different account).
  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  const label = name?.trim() || email?.trim() || 'Account';
  const showImage = Boolean(src) && !forceInitials && !failed;

  return (
    <span
      className={cn(
        'relative inline-flex h-9 w-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        'bg-gradient-to-br from-primary via-primary to-primary/75 font-bold uppercase leading-none text-primary-foreground',
        'text-[0.7rem] ring-1 ring-inset ring-white/15 dark:ring-white/10',
        className,
      )}
    >
      {showImage ? (
        <Image
          src={src as string}
          alt={alt ?? `${label} profile picture`}
          fill
          sizes={sizes}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{initials(name, email)}</span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}
