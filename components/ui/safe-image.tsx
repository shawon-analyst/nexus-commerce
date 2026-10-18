'use client';

import * as React from 'react';
import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type SafeImageProps = {
  src?: string | null;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  sizes?: string;
  priority?: boolean;
};

/**
 * next/image wrapper that degrades gracefully.
 * Product images are free-text URLs supplied by the shop owner, so a broken or
 * missing link must never break the layout.
 */
export function SafeImage({
  src,
  alt,
  className,
  wrapperClassName,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw',
  priority = false,
}: SafeImageProps) {
  const [failed, setFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);

  const showFallback = !src || failed;

  return (
    <div className={cn('media-frame', wrapperClassName)}>
      {!showFallback && !loaded && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted-foreground/10" />
      )}

      {showFallback ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageIcon className="h-8 w-8" />
          <span className="text-xs font-medium">No image</span>
        </div>
      ) : (
        <Image
          src={src as string}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          className={cn(
            'object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
            className,
          )}
        />
      )}
    </div>
  );
}
