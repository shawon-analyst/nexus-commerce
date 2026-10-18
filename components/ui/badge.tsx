import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
        /*
         * The success / warning / info tones are used on top of photographs
         * (product cards) as well as on flat cards. A translucent background is
         * unreadable over a bright photo — the image shows through and the pale
         * text disappears — so the dark theme uses a *near-opaque* tinted
         * surface and a light foreground. Contrast is >= 6:1 in both themes on
         * any backdrop.
         */
        success:
          'border-emerald-600/40 bg-emerald-100 text-emerald-900 dark:border-emerald-400/40 dark:bg-emerald-950/90 dark:text-emerald-200',
        warning:
          'border-amber-600/40 bg-amber-100 text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/90 dark:text-amber-200',
        info: 'border-blue-600/40 bg-blue-100 text-blue-900 dark:border-blue-400/40 dark:bg-blue-950/90 dark:text-blue-200',
        muted: 'border-transparent bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
