'use client';

import Link from 'next/link';
import { categoryIcon } from '@/lib/category-icons';
import { cn } from '@/lib/utils';

/**
 * One category filter chip, shared by the header strip and the /products filter
 * bar. It is an `<a>` when given an `href` (header navigation, so it prefetches)
 * and a `<button>` when given `onClick` (the filter bar, which patches the
 * query string in place).
 *
 * Hover: a small lift, a background shift and a soft shadow. Active: the solid
 * primary fill, bold text and an icon that follows the accent.
 */
const PILL_BASE =
  'group inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 ' +
  'text-xs font-medium transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-md ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const PILL_ACTIVE = 'border-primary bg-primary font-semibold text-primary-foreground shadow-sm';

const PILL_IDLE =
  'border-transparent bg-muted/60 text-muted-foreground hover:bg-accent hover:text-foreground';

export function CategoryPill({
  name,
  slug,
  active = false,
  href,
  onClick,
  className,
}: {
  name: string;
  slug?: string | null;
  active?: boolean;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const Icon = categoryIcon(slug, name);

  const content = (
    <>
      <Icon
        className={cn(
          'h-3.5 w-3.5 shrink-0 transition-all duration-200 ease-in-out',
          active ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-primary',
        )}
        strokeWidth={2.25}
      />
      <span>{name}</span>
    </>
  );

  const classes = cn(PILL_BASE, active ? PILL_ACTIVE : PILL_IDLE, className);

  if (href) {
    return (
      <Link href={href} prefetch className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={classes}>
      {content}
    </button>
  );
}
