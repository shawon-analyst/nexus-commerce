'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A password field with a show/hide toggle.
 *
 * Several screens now set or confirm a password — sign in, the reset link, the
 * profile's change-password form, the recovery-email card and the admin's
 * set-password dialog — and the eye toggle was being re-implemented inline on
 * each one. (The invite-staff dialog keeps its own wide *Show* button, which
 * pairs with the suggested password beside it.) One component keeps the
 * accessible label, the icon swap and the padding identical everywhere.
 *
 * `pr-10` reserves room for the button so a long password never slides under it.
 * The toggle is `type="button"` so it can never submit the surrounding form.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, disabled, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        {...props}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        className={cn('pr-10', className)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setVisible((value) => !value)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = 'PasswordInput';
