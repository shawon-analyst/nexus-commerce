'use client';

import { Mail, Smartphone, type LucideIcon } from 'lucide-react';
import type { IdentifierMode } from '@/lib/phone';
import { cn } from '@/lib/utils';

const TABS: Array<{ id: IdentifierMode; label: string; Icon: LucideIcon }> = [
  { id: 'email', label: 'Email', Icon: Mail },
  { id: 'phone', label: 'Mobile', Icon: Smartphone },
];

/**
 * The Email ⇄ Mobile switch.
 *
 * Two flat buttons rather than one sliding indicator: a sliding pill needs a
 * measured offset, and a measurement that arrives after first paint is exactly
 * the kind of thing that shows up as a jump on a slow phone.
 *
 * Switching tabs must never submit the form, so both buttons are `type="button"`
 * — inside a `<form>` the default is `type="submit"`.
 */
export function IdentifierTabs({
  value,
  onChange,
  disabled = false,
}: {
  value: IdentifierMode;
  onChange: (mode: IdentifierMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label="How to sign in"
      className="grid grid-cols-2 gap-1 rounded-2xl border border-black/5 bg-black/[0.04] p-1 dark:border-white/10 dark:bg-white/[0.06]"
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
              'disabled:pointer-events-none disabled:opacity-60',
              active
                ? 'bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
