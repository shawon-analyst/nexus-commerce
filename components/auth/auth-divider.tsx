import * as React from 'react';

/**
 * The "or use" rule that separates the Google button from the email / mobile
 * form. `bg-background` was wrong on a translucent card — the chip has to stay
 * glassy too, or it reads as a solid block punched out of the panel.
 */
export function AuthDivider({ label = 'or use' }: { label?: string }) {
  return (
    <div className="relative py-0.5">
      <div aria-hidden className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-black/10 dark:border-white/10" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-transparent px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}
