'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/**
 * Light / Dark / System switcher.
 *
 * Nothing theme-dependent is rendered until after mount, otherwise the server
 * (which cannot know the visitor's choice) and the client disagree and React
 * logs a hydration mismatch.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const active = mounted ? (theme ?? 'system') : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative h-9 w-9', className)}
          aria-label="Switch colour theme"
        >
          {/* Both icons are rendered and cross-faded with CSS only, so the
              button never shifts or flickers when the theme changes. */}
          <Sun className="h-[1.15rem] w-[1.15rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.15rem] w-[1.15rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => setTheme(option.value)}
            className="cursor-pointer gap-2"
          >
            <option.icon className="h-4 w-4" />
            <span className="flex-1">{option.label}</span>
            {active === option.value && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
